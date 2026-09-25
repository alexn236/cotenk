import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useWorkspace } from "./store";
import { isDesktop, resolveWorkspaceDir } from "./workspace";
import type { Doc, Folder } from "./types";

/**
 * Workspace folder sync: mirrors docs/folders into a local directory as
 * `.md` files so the Devin agent can read and edit them on disk.
 *
 *   Supabase → store (initSync) → reconcile → files
 *   agent edits file → watcher → reconcile → store → initSync → Supabase
 *
 * Every file carries a small frontmatter block so its identity survives
 * renames and moves:
 *
 *   ---
 *   cotenk-id: <doc id>
 *   title: <doc title>
 *   folder: <folder name or empty>
 *   pinned: true|false
 *   ---
 *
 *   <markdown body>
 *
 * Reconcile is bidirectional and idempotent: identical states produce
 * zero writes, so watcher events triggered by our own writes settle
 * immediately. Newer side wins on conflicts (file mtime vs updatedAt).
 * Files without `cotenk-id` are adopted as new docs, never deleted.
 */

const DEBOUNCE_MS = 350;
const FM_RE = /^---\n([\s\S]*?)\n---\n?/;

type FileEntry = { path: string; mtime: number };

type Scanned = {
  path: string;
  mtime: number;
  /** Frontmatter doc id, or null for a foreign markdown file. */
  id: string | null;
  title: string | null;
  folderName: string | null;
  pinned: boolean;
  /** Body below the frontmatter — equals Doc.content. */
  content: string;
};

function slug(s: string): string {
  const t = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return t || "untitled";
}

/**
 * Workspace-relative path the mirror uses for a doc (before collision
 * suffixes). Good enough to point an agent at the right file — the
 * frontmatter `cotenk-id` disambiguates.
 */
export function docRelativePath(doc: Doc, folders: Folder[]): string {
  const folder = doc.folderId
    ? folders.find((f) => f.id === doc.folderId)
    : undefined;
  const dir = folder ? `${slug(folder.name)}/` : "";
  return `${dir}${slug(doc.title)}.md`;
}

/**
 * Forward-slash form of a path. The backend reports Windows paths with
 * backslashes while joinPath builds forward-slash paths — without this,
 * the same file looked "moved" on every pass and got deleted.
 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

/** Comparison key: normalized and case-folded (Windows/macOS paths are
 *  case-insensitive). */
function pathKey(p: string): string {
  return normPath(p).toLowerCase();
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/");
}

function serialize(doc: Doc, folderName: string | null): string {
  const title = doc.title.replace(/\n/g, " ").trim() || "Untitled";
  return (
    `---\ncotenk-id: ${doc.id}\ntitle: ${title}\n` +
    `folder: ${folderName ?? ""}\npinned: ${doc.pinned}\n---\n\n` +
    doc.content
  );
}

/**
 * An empty doc title is written to disk as "Untitled" — treat that pair
 * as equal so a fresh page doesn't get renamed mid-typing.
 */
function sameTitle(fileTitle: string | null, docTitle: string): boolean {
  return (
    fileTitle === null ||
    fileTitle === docTitle ||
    (docTitle.trim() === "" && fileTitle === "Untitled")
  );
}

function parseFile(path: string, mtime: number, text: string): Scanned {
  // Agents on Windows may write CRLF or a BOM; without normalizing, the
  // frontmatter doesn't match and the page gets re-adopted under a new id.
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const m = raw.match(FM_RE);
  if (!m) {
    return {
      path,
      mtime,
      id: null,
      title: null,
      folderName: null,
      pinned: false,
      content: raw,
    };
  }
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    path,
    mtime,
    id: fields["cotenk-id"] || null,
    title: fields["title"] ?? null,
    folderName: fields["folder"] || null,
    pinned: fields["pinned"] === "true",
    content: raw.slice(m[0].length).replace(/^\n/, ""),
  };
}

async function scan(root: string): Promise<Scanned[]> {
  const entries = await invoke<FileEntry[]>("fs_list_md", { root });
  const out: Scanned[] = [];
  for (const e of entries) {
    try {
      const raw = await invoke<string>("fs_read", { path: e.path });
      out.push(parseFile(normPath(e.path), e.mtime, raw));
    } catch {
      /* unreadable file — skip */
    }
  }
  return out;
}

/** Desired path for a doc; dedupes against paths already claimed. */
function docPath(
  root: string,
  doc: Doc,
  foldersById: Map<string, Folder>,
  taken: Map<string, string>,
): string {
  const dir = doc.folderId
    ? slug(foldersById.get(doc.folderId)?.name ?? "")
    : "";
  const base = slug(doc.title);
  for (let i = 0; ; i++) {
    const name = i === 0 ? `${base}.md` : `${base}-${i + 1}.md`;
    const p = joinPath(root, dir, name);
    const owner = taken.get(pathKey(p));
    if (owner === undefined || owner === doc.id) {
      taken.set(pathKey(p), doc.id);
      return p;
    }
  }
}

let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/**
 * Doc ids whose file existed at the last completed reconcile. A doc is
 * only deleted from the store when its file disappears *after* having
 * existed — on the first sync (or after an app restart) missing files
 * are simply (re)written instead of wiping the workspace.
 */
let knownFileIds = new Set<string>();

async function reconcile() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    /** Docs adopted this pass → write frontmatter onto their own path. */
    const adoptedThisPass = new Map<string, string>();
    const root = normPath(await resolveWorkspaceDir());
    const files = await scan(root);
    const byId = new Map<string, Scanned>();
    for (const f of files) if (f.id) byId.set(f.id, f);

    // ---- pass 1: disk → store ----
    {
      const st = useWorkspace.getState();
      const foldersById = new Map(st.folders.map((f) => [f.id, f]));
      const folderIdByName = new Map(
        st.folders.map((f) => [f.name.toLowerCase(), f.id]),
      );
      const docsById = new Map(st.docs.map((d) => [d.id, d]));
      let docs = st.docs;
      let folders = st.folders;
      let changed = false;

      const folderFor = (name: string | null): string | null => {
        if (!name) return null;
        // Match the display name or its directory slug ("q3-plans" for
        // "Q3 Plans"), so a page dropped into that folder joins it.
        const existing =
          folderIdByName.get(name.toLowerCase()) ??
          folders.find((x) => slug(x.name) === slug(name))?.id;
        if (existing) return existing;
        const f: Folder = { id: `fld-${Date.now().toString(36)}-${folders.length}`, name };
        folders = [...folders, f];
        folderIdByName.set(name.toLowerCase(), f.id);
        foldersById.set(f.id, f);
        changed = true;
        return f.id;
      };

      // A doc whose file existed before and is now gone was deleted on
      // disk (agent or file manager) — remove it from the store.
      for (const id of knownFileIds) {
        if (!byId.has(id) && docsById.has(id)) {
          docs = docs.filter((d) => d.id !== id);
          changed = true;
        }
      }

      const adoptedPaths = new Map<string, string>(); // new doc id → file
      for (const f of files) {
        const doc = f.id ? docsById.get(f.id) : undefined;
        if (doc) {
          const docFolder = doc.folderId
            ? foldersById.get(doc.folderId)?.name ?? ""
            : "";
          const differs =
            f.content !== doc.content ||
            !sameTitle(f.title, doc.title) ||
            (f.folderName ?? "") !== docFolder ||
            f.pinned !== doc.pinned;
          // Newer side wins; a tie goes to disk (the agent may have just
          // edited without bumping any stamp). Identical states skip.
          if (differs && f.mtime >= doc.updatedAt) {
            docs = docs.map((d) =>
              d.id === doc.id
                ? {
                    ...d,
                    title: sameTitle(f.title, d.title) ? d.title : f.title!,
                    content: f.content,
                    pinned: f.pinned,
                    folderId: folderFor(f.folderName),
                    updatedAt: Date.now(),
                  }
                : d,
            );
            changed = true;
          }
        } else if (!f.id) {
          // Foreign markdown file (agent/user dropped it in) — adopt.
          const stem =
            f.path.split(/[\\/]/).pop()?.replace(/\.md$/i, "") ?? "Untitled";
          // A leading "# Title" becomes the page title — drop it from the
          // body, or the editor shows the title twice.
          const lead = f.content.match(/^\s*#\s+(.+)\n*/);
          const h1 = (lead?.[1] ?? f.content.match(/^#\s+(.+)$/m)?.[1])?.trim();
          const parentDir = f.path.replace(/[\\/][^\\/]+$/, "");
          const inSubdir =
            parentDir.replace(/\\/g, "/") !== root.replace(/\\/g, "/");
          const dirName = inSubdir ? parentDir.split(/[\\/]/).pop() : null;
          const doc2: Doc = {
            id: `doc-${Date.now().toString(36)}-${adoptedPaths.size}`,
            folderId: folderFor(dirName ?? null),
            title: h1 || stem,
            content: lead ? f.content.slice(lead[0].length) : f.content,
            pinned: false,
            updatedAt: f.mtime || Date.now(),
          };
          adoptedPaths.set(doc2.id, f.path);
          docs = [doc2, ...docs];
          changed = true;
        }
      }
      adoptedPaths.forEach((p, id) => adoptedThisPass.set(id, p));
      if (changed) useWorkspace.setState({ docs, folders });
    }

    // ---- pass 2: store → disk ----
    {
      const st = useWorkspace.getState();
      const foldersById = new Map(st.folders.map((f) => [f.id, f]));
      const taken = new Map<string, string>();
      for (const f of files) if (f.id) taken.set(pathKey(f.path), f.id);

      const writes: [string, string][] = [];
      const removals: string[] = [];
      const claimed = new Set<string>();

      for (const doc of st.docs) {
        const adoptedPath = adoptedThisPass.get(doc.id);
        const path = adoptedPath ?? docPath(root, doc, foldersById, taken);
        if (adoptedPath) taken.set(pathKey(adoptedPath), doc.id);
        claimed.add(doc.id);
        const existing = byId.get(doc.id);
        const folderName = doc.folderId
          ? foldersById.get(doc.folderId)?.name ?? null
          : null;
        if (!existing) {
          writes.push([path, serialize(doc, folderName)]);
          continue;
        }
        if (pathKey(existing.path) !== pathKey(path)) {
          writes.push([path, serialize(doc, folderName)]);
          removals.push(existing.path);
          continue;
        }
        const differs =
          existing.content !== doc.content ||
          !sameTitle(existing.title, doc.title) ||
          (existing.folderName ?? "") !== (folderName ?? "") ||
          existing.pinned !== doc.pinned;
        // Only rewrite when the store is the newer side — otherwise pass 1
        // already adopted the file's version into the store.
        if (differs && doc.updatedAt > existing.mtime) {
          writes.push([path, serialize(doc, folderName)]);
        }
      }
      // Files whose doc id vanished from the store were deleted in the UI.
      for (const f of files) {
        if (f.id && !claimed.has(f.id) && !removals.includes(f.path)) {
          removals.push(f.path);
        }
      }
      for (const [p, c] of writes) await invoke("fs_write", { path: p, contents: c });
      // Never delete a file this pass just wrote (same file, other spelling).
      const written = new Set(writes.map(([p]) => pathKey(p)));
      for (const p of removals) {
        if (!written.has(pathKey(p))) await invoke("fs_remove", { path: p });
      }
      // After this pass every store doc has a file on disk — remember
      // which ids are file-backed so a future file deletion means a
      // doc deletion (and not "never synced yet").
      knownFileIds = new Set(st.docs.map((d) => d.id));
    }
  } catch {
    /* disk offline / dir gone — next trigger retries */
  } finally {
    running = false;
    if (queued) {
      queued = false;
      schedule();
    }
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void reconcile(), DEBOUNCE_MS);
}

/**
 * Starts folder sync for the session: waits until the Supabase pull has
 * landed (syncStatus reaches synced/error), merges once, then watches
 * the folder. Returns a dispose function.
 */
export function initFileSync(): () => void {
  // The web build has no local folder — Supabase is the only store.
  if (!isDesktop()) return () => {};
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  let unsubStore: (() => void) | null = null;
  let unsubGate: (() => void) | null = null;

  const start = async () => {
    if (disposed) return;
    const root = await resolveWorkspaceDir();
    await reconcile();
    try {
      await invoke("fs_watch", { root });
      unlisten = await listen<string[]>("ws:fs", () => schedule());
    } catch {
      /* watcher unavailable — still sync on store changes */
    }
    unsubStore = useWorkspace.subscribe((s, prev) => {
      if (s.docs !== prev.docs || s.folders !== prev.folders) schedule();
    });
  };

  const status = useWorkspace.getState().syncStatus;
  if (status === "synced" || status === "error" || status === "idle") {
    void start();
  } else {
    unsubGate = useWorkspace.subscribe((s) => {
      if (s.syncStatus === "synced" || s.syncStatus === "error") {
        unsubGate?.();
        unsubGate = null;
        void start();
      }
    });
  }

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    unlisten?.();
    unsubStore?.();
    unsubGate?.();
    void invoke("fs_unwatch").catch(() => {});
  };
}
