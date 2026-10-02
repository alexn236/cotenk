import { strToU8, zipSync } from "fflate";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-store";
import { useWorkspace } from "./store";
import { useAgent } from "./agent-store";
import { saveBytes } from "./files";
import { BUCKET } from "./images";
import type { Doc, Folder } from "./types";

/**
 * Workspace export (ZIP of markdown + attachments), cleanup of stored
 * files nothing points to any more, and account deletion.
 */

const REF_RE = /cotenk-(?:image|file):([^)\s"#]+)(?:#[^)\s"]*)?/g;
const ONE_DAY = 24 * 60 * 60 * 1000;

const signedInWorkspace = () => {
  const { status, workspaceId } = useAuth.getState();
  return status === "signedIn" ? workspaceId : null;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";

/* ---------- export ---------- */

function pagePaths(docs: Doc[], folders: Folder[]): Map<string, string> {
  const folderName = new Map(folders.map((f) => [f.id, slug(f.name)]));
  const byId = new Map(docs.map((d) => [d.id, d]));
  const used = new Set<string>();
  const out = new Map<string, string>();
  const place = (d: Doc, depth = 0): string => {
    const known = out.get(d.id);
    if (known) return known;
    const parent = d.parentId ? byId.get(d.parentId) : undefined;
    let dir =
      parent && depth < 8
        ? place(parent, depth + 1).replace(/\.md$/, "")
        : d.folderId
          ? (folderName.get(d.folderId) ?? "")
          : "";
    dir = dir ? `${dir}/` : "";
    let path = `${dir}${slug(d.title)}.md`;
    for (let i = 2; used.has(path.toLowerCase()); i++) {
      path = `${dir}${slug(d.title)}-${i}.md`;
    }
    used.add(path.toLowerCase());
    out.set(d.id, path);
    return path;
  };
  docs.forEach((d) => place(d));
  return out;
}

/** Content with stored-file references turned into relative paths. */
function localizeRefs(md: string, depth: number, found: Set<string>): string {
  const up = "../".repeat(depth);
  return md.replace(REF_RE, (_m, path: string) => {
    found.add(path);
    return `${up}assets/${path.split("/").pop()}`;
  });
}

function chatMarkdown(title: string, messages: { role: string; text: string; images?: string[] }[]) {
  const parts = [`# ${title || "Chat"}`];
  for (const m of messages) {
    if (m.role === "tool") continue;
    const who = m.role === "user" ? "You" : "Agent";
    const imgs = (m.images ?? [])
      .map((src) => `![](${src})`)
      .join("\n");
    parts.push(`**${who}:**\n\n${[m.text, imgs].filter(Boolean).join("\n\n")}`);
  }
  return parts.join("\n\n");
}

/** Builds the ZIP and offers it for saving. False if the user cancelled. */
export async function exportWorkspace(
  onProgress?: (msg: string) => void,
): Promise<boolean> {
  const { docs, folders } = useWorkspace.getState();
  const { chats } = useAgent.getState();
  const files: Record<string, Uint8Array> = {};
  const found = new Set<string>();

  onProgress?.("Collecting pages…");
  const paths = pagePaths(docs, folders);
  for (const d of docs) {
    const path = paths.get(d.id)!;
    const depth = path.split("/").length - 1;
    const body = localizeRefs(d.content, depth + 1, found);
    files[`pages/${path}`] = strToU8(
      `---\ntitle: ${JSON.stringify(d.title.trim() || "Untitled")}\n---\n\n${body}\n`,
    );
  }

  const chatNames = new Set<string>();
  for (const c of chats) {
    let name = slug(c.title);
    for (let i = 2; chatNames.has(name); i++) name = `${slug(c.title)}-${i}`;
    chatNames.add(name);
    const md = chatMarkdown(
      c.title,
      c.messages.map((m) => ({
        ...m,
        images: m.images?.map((src) =>
          src.startsWith("cotenk-image:") ? localizeRefs(src, 1, found) : src,
        ),
      })),
    );
    files[`chats/${name}.md`] = strToU8(md);
  }

  const ws = signedInWorkspace();
  if (found.size > 0 && ws) {
    const sb = getSupabase();
    let done = 0;
    for (const path of found) {
      onProgress?.(`Downloading attachments (${++done}/${found.size})…`);
      const { data } = await sb.storage.from(BUCKET).download(path);
      if (data) {
        files[`assets/${path.split("/").pop()}`] = new Uint8Array(
          await data.arrayBuffer(),
        );
      }
    }
  }

  files["README.txt"] = strToU8(
    [
      "CoTenk export",
      "",
      "pages/   your pages as markdown (folders and subpages become directories)",
      "chats/   agent conversations",
      "assets/  images and files used by pages and chats",
      "",
      "The markdown opens in any editor, Obsidian included.",
    ].join("\n"),
  );

  onProgress?.("Compressing…");
  const zip = zipSync(files, { level: 6 });
  const stamp = new Date().toISOString().slice(0, 10);
  return saveBytes(`cotenk-export-${stamp}.zip`, zip, "application/zip");
}

/* ---------- stored files ---------- */

type Listed = { path: string; createdAt: number; size: number };

async function listFolder(ws: string, kind: string): Promise<Listed[]> {
  const sb = getSupabase();
  const out: Listed[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(`${ws}/${kind}`, { limit: 1000, offset });
    if (error) throw new Error(error.message);
    for (const o of data ?? []) {
      if (!o.id) continue; // a sub-folder placeholder
      out.push({
        path: `${ws}/${kind}/${o.name}`,
        createdAt: new Date(o.created_at ?? 0).getTime(),
        size: Number((o.metadata as { size?: number } | null)?.size ?? 0),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

const listAll = async (ws: string) =>
  (await Promise.all(["note", "chat", "file"].map((k) => listFolder(ws, k)))).flat();

async function removePaths(paths: string[]) {
  const sb = getSupabase();
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** Refs in what's open on this device — not yet synced edits count too. */
function localRefs(): Set<string> {
  const refs = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(REF_RE)) refs.add(m[1]);
  };
  useWorkspace.getState().docs.forEach((d) => scan(d.content));
  useAgent
    .getState()
    .chats.forEach((c) => c.messages.forEach((m) => (m.images ?? []).forEach(scan)));
  return refs;
}

export type UnusedFiles = { paths: string[]; bytes: number };

/**
 * Files nobody points to: not in a page, an older version, the recently
 * deleted pages or a chat. Younger than `graceMs` is always kept.
 */
export async function findUnusedFiles(graceMs = ONE_DAY): Promise<UnusedFiles> {
  const ws = signedInWorkspace();
  if (!ws) return { paths: [], bytes: 0 };
  const { data, error } = await getSupabase().rpc("referenced_note_files", { ws });
  if (error) throw new Error(error.message);
  const keep = new Set<string>([...((data ?? []) as string[]), ...localRefs()]);
  const cutoff = Date.now() - graceMs;
  const unused = (await listAll(ws)).filter(
    (f) => !keep.has(f.path) && f.createdAt < cutoff,
  );
  return {
    paths: unused.map((f) => f.path),
    bytes: unused.reduce((n, f) => n + f.size, 0),
  };
}

export async function removeUnusedFiles(found: UnusedFiles): Promise<void> {
  await removePaths(found.paths);
}

const CLEANUP_KEY = (ws: string) => `cotenk-cleanup:${ws}`;

/** Weekly quiet cleanup after a sync; keeps anything younger than 3 days. */
export async function maybeAutoCleanup(): Promise<void> {
  const ws = signedInWorkspace();
  if (!ws) return;
  try {
    const last = Number(localStorage.getItem(CLEANUP_KEY(ws)) ?? 0);
    if (Date.now() - last < 7 * ONE_DAY) return;
    localStorage.setItem(CLEANUP_KEY(ws), String(Date.now()));
    await removeUnusedFiles(await findUnusedFiles(3 * ONE_DAY));
  } catch {
    /* offline or migration missing — the next sync retries */
  }
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/* ---------- account deletion ---------- */

/** Deletes stored files, then the account and everything it owns. */
export async function deleteAccount(): Promise<string | null> {
  const ws = signedInWorkspace();
  const sb = getSupabase();
  try {
    if (ws) await removePaths((await listAll(ws)).map((f) => f.path));
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  const { error } = await sb.rpc("delete_account");
  if (error) return error.message;
  // The server session is gone with the account; drop the local one.
  await sb.auth.signOut({ scope: "local" });
  return null;
}
