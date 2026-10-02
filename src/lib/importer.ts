import { unzipSync } from "fflate";
import type { Doc, Folder } from "./types";
import { newId } from "./ids";

/**
 * Import pipeline for other tools' exports: a Notion export (.zip, nested
 * zips included), an Obsidian vault (dropped or picked as a folder) or
 * loose .md/.txt files. Everything becomes plain CoTenk pages:
 *
 *  - Notion: the 32-hex id suffixes are stripped from titles and folder
 *    names, relative page links become [[wikilinks]], <aside> callouts
 *    become quotes and CSV databases become a page with a table (row
 *    titles link to the row pages).
 *  - Obsidian: YAML frontmatter is folded into a "Tags:" line, `![[x]]`
 *    embeds resolve to images or wikilinks, dot folders are skipped.
 *  - Images up to 512 KB are inlined as data URLs; larger attachments
 *    and other files are counted as skipped.
 *
 * Folders are one level deep in CoTenk: a page lands in the folder named
 * after the first directory of its path.
 *
 * Loaded on demand (code-split) — it pulls in the zip decoder.
 */

export type ImportSource = "notion" | "obsidian" | "markdown";

export type RawFile = {
  /** Path relative to what was dropped/picked, forward slashes. */
  path: string;
  /** Empty for files that are skipped anyway (dot folders). */
  bytes: Uint8Array;
};

export type ImportPlan = {
  docs: Doc[];
  /** Only folders that don't exist in the workspace yet. */
  folders: Folder[];
  source: ImportSource;
  /** Attachments and files that were not carried over. */
  skipped: number;
  /** Pages identical to existing ones, not imported again. */
  duplicates: number;
};

const TEXT_EXT = /\.(md|markdown|mdown|txt)$/i;
const CSV_EXT = /\.csv$/i;
const ZIP_EXT = /\.zip$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
/** Notion appends a 32-hex block id to every page and folder name. */
const NOTION_ID = /\s+[0-9a-f]{32}$/i;
const MAX_INLINE_IMAGE = 512 * 1024;
const MAX_FILES = 5000;

const decoder = new TextDecoder("utf-8");

function normPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "")
    .replace(/\/{2,}/g, "/");
}

/** Dot folders (.obsidian, .trash, .git) and archive junk. */
function isIgnored(path: string): boolean {
  return path
    .split("/")
    .some((seg) => seg.startsWith(".") || seg === "__MACOSX");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** "Roadmap 1a2b…(32 hex).md" → "Roadmap". */
export function cleanName(name: string): string {
  return safeDecode(name)
    .replace(/\.[^./]+$/, "")
    .replace(/_all$/, "")
    .replace(NOTION_ID, "")
    .trim();
}

/** Resolves `rel` against the directory `base` (both forward-slash). */
function resolvePath(base: string, rel: string): string {
  const parts = base ? base.split("/") : [];
  for (const seg of safeDecode(rel).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Unpacks .zip files (recursively — Notion nests "Part-1.zip" inside). */
export function expandZips(files: RawFile[], depth = 0): RawFile[] {
  const out: RawFile[] = [];
  for (const f of files) {
    if (!ZIP_EXT.test(f.path) || depth > 3) {
      out.push(f);
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(f.bytes, {
        filter: (e) => !e.name.endsWith("/"),
      });
    } catch {
      out.push(f); // not a readable zip — counted as skipped later
      continue;
    }
    const inner = Object.entries(entries).map(([name, bytes]) => ({
      path: normPath(name),
      bytes,
    }));
    out.push(...expandZips(inner, depth + 1));
  }
  return out;
}

/* ---------- csv ---------- */

/** RFC 4180-ish CSV parser (quotes, escaped quotes, newlines in cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function tableCell(s: string): string {
  return s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/* ---------- markdown conversion ---------- */

type Frontmatter = { title: string | null; tags: string[] };

/** Strips a leading YAML frontmatter block; keeps title and tags. */
function splitFrontmatter(text: string): { fm: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { fm: { title: null, tags: [] }, body: text };
  const fm: Frontmatter = { title: null, tags: [] };
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (key === "title" && val) fm.title = val.replace(/^["']|["']$/g, "");
    if (key === "tags" || key === "tag") {
      if (val.startsWith("[")) {
        fm.tags.push(
          ...val
            .slice(1, -1)
            .split(",")
            .map((t) => t.trim().replace(/^["'#]|["']$/g, ""))
            .filter(Boolean),
        );
      } else if (val) {
        fm.tags.push(...val.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean));
      } else {
        // Block list: "tags:\n  - a\n  - b"
        while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
          fm.tags.push(lines[++i].replace(/^\s*-\s+/, "").replace(/^#/, "").trim());
        }
      }
    }
  }
  return { fm, body: text.slice(m[0].length) };
}

type Ctx = {
  source: ImportSource;
  /** Normalized lowercase path → page title (md and csv files). */
  titleByPath: Map<string, string>;
  /** Lowercase clean basename → page title (Obsidian-style lookups). */
  titleByName: Map<string, string>;
  /** Lowercase path and lowercase basename → data URL. */
  images: Map<string, string>;
  missingAttachments: Set<string>;
};

const wikilink = (title: string, text?: string) =>
  text && text !== title ? `[[${title}|${text}]]` : `[[${title}]]`;

function lookupTitle(ctx: Ctx, fileDir: string, href: string): string | null {
  const target = href.split("#")[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const full = resolvePath(fileDir, target).toLowerCase();
  return (
    ctx.titleByPath.get(full) ??
    ctx.titleByName.get(cleanName(basename(target)).toLowerCase()) ??
    null
  );
}

function lookupImage(ctx: Ctx, fileDir: string, href: string): string | null {
  const target = safeDecode(href.split("#")[0].split("?")[0]);
  return (
    ctx.images.get(resolvePath(fileDir, target).toLowerCase()) ??
    ctx.images.get(basename(target).toLowerCase()) ??
    null
  );
}

/** Rewrites links/images/callouts of one page body. */
function convertBody(body: string, fileDir: string, ctx: Ctx): string {
  let out = body;

  // Notion callouts: <aside>💡 text</aside> → quote.
  out = out.replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/g, (_m, inner: string) =>
    inner
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => (l.trim() ? `> ${l.trim()}` : ">"))
      .join("\n"),
  );

  // Obsidian embeds: ![[image.png|300]] / ![[Other note]].
  out = out.replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, target: string, alt?: string) => {
    const name = target.trim();
    if (IMG_EXT.test(name)) {
      const url = lookupImage(ctx, fileDir, name);
      if (url) return `![${alt && !/^\d+(x\d+)?$/.test(alt) ? alt : name}](${url})`;
      ctx.missingAttachments.add(name);
      return `*[image: ${name}]*`;
    }
    const title = ctx.titleByName.get(cleanName(name).toLowerCase());
    return title ? wikilink(title) : m.slice(1);
  });

  // Markdown images with relative paths.
  out = out.replace(/!\[([^\]]*)\]\(<?([^)>]+?)>?\)/g, (m, alt: string, href: string) => {
    if (/^(https?:|data:)/i.test(href)) return m;
    const url = lookupImage(ctx, fileDir, href);
    if (url) return `![${alt}](${url})`;
    const name = safeDecode(basename(href));
    ctx.missingAttachments.add(name);
    return `*[${alt || "attachment"}: ${name}]*`;
  });

  // Relative links to other pages → [[wikilinks]].
  out = out.replace(/(^|[^!])\[([^\]]+)\]\(<?([^)>]+?)>?\)/g, (m, pre: string, text: string, href: string) => {
    if (/^(https?:|mailto:|#)/i.test(href)) return m;
    const title = lookupTitle(ctx, fileDir, href);
    if (title) return `${pre}${wikilink(title, text)}`;
    if (!/\.(md|csv)(#.*)?$/i.test(safeDecode(href))) {
      // A link to an attachment we didn't carry over.
      ctx.missingAttachments.add(safeDecode(basename(href)));
      return `${pre}${text}`;
    }
    return `${pre}${text}`;
  });

  // [[links]]: drop Notion id suffixes and Obsidian folder paths
  // ([[Daily/2026-09-01]] → [[2026-09-01]]) — pages are found by title.
  out = out.replace(/\[\[([^\]|#]+?)(#[^\]|]*)?(\|[^\]]*)?\]\]/g, (_m, t: string, head?: string, rest?: string) => {
    const clean = t.replace(NOTION_ID, "").trim();
    const title =
      ctx.titleByPath.get(`${clean.toLowerCase()}.md`) ??
      ctx.titleByName.get(cleanName(basename(clean)).toLowerCase()) ??
      clean;
    return `[[${title}${head ?? ""}${rest ?? ""}]]`;
  });

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- plan ---------- */

function detectSource(paths: string[], texts: string[]): ImportSource {
  if (paths.some((p) => p.split("/").some((s) => NOTION_ID.test(cleanNameKeepId(s))))) {
    return "notion";
  }
  if (
    paths.some((p) => p.split("/").includes(".obsidian")) ||
    texts.some((t) => /\[\[[^\]\n]+\]\]/.test(t))
  ) {
    return "obsidian";
  }
  return "markdown";
}

/** Stem without extension, id suffix kept (for detection). */
function cleanNameKeepId(seg: string): string {
  return safeDecode(seg).replace(/\.[^./]+$/, "").replace(/_all$/, "");
}

function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return `image/${ext}`;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Longest directory prefix shared by all paths ("" if none). */
function commonDir(paths: string[]): string {
  if (paths.length === 0) return "";
  let parts = dirname(paths[0]).split("/").filter(Boolean);
  for (const p of paths.slice(1)) {
    const d = dirname(p).split("/").filter(Boolean);
    let i = 0;
    while (i < parts.length && i < d.length && parts[i] === d[i]) i++;
    parts = parts.slice(0, i);
  }
  return parts.join("/");
}


/**
 * Turns raw files into pages and folders for the given workspace. Pure
 * apart from id/time generation — nothing is written to the store here.
 */
export function buildImport(
  input: RawFile[],
  existing: { docs: Doc[]; folders: Folder[] },
): ImportPlan {
  const all = expandZips(
    input.map((f) => ({ ...f, path: normPath(f.path) })),
  ).slice(0, MAX_FILES);
  const allPaths = all.map((f) => f.path);
  const files = all.filter((f) => !isIgnored(f.path));

  const textFiles = files.filter((f) => TEXT_EXT.test(f.path));
  const csvFiles = files.filter((f) => CSV_EXT.test(f.path));
  const imageFiles = files.filter((f) => IMG_EXT.test(f.path));
  let skipped = files.length - textFiles.length - csvFiles.length - imageFiles.length;

  const texts = new Map(
    textFiles.map((f) => [
      f.path,
      decoder.decode(f.bytes).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"),
    ]),
  );
  const source = detectSource(allPaths, [...texts.values()]);

  // Notion writes both "DB.csv" and "DB_all.csv" — keep the complete one.
  const csvKeep = csvFiles.filter(
    (f) =>
      /_all\.csv$/i.test(f.path) ||
      !csvFiles.some(
        (o) => o.path.toLowerCase() === f.path.toLowerCase().replace(/\.csv$/, "_all.csv"),
      ),
  );

  // ---- titles first, so links can resolve across files ----
  type Page = {
    path: string;
    title: string;
    body: string;
    tags: string[];
    csv?: string[][];
  };
  const pages: Page[] = [];
  for (const [path, raw] of texts) {
    const { fm, body } = splitFrontmatter(raw);
    const stem = cleanName(basename(path));
    const lead = /^\s*#\s+(.+)\n*/.exec(body);
    const h1 = lead?.[1].trim() ?? null;
    let title: string;
    let rest = body;
    if (fm.title) {
      title = fm.title;
    } else if (source === "obsidian") {
      // Obsidian's page name is the file name; [[links]] point at it.
      title = stem;
      if (h1 && h1.toLowerCase() === stem.toLowerCase()) rest = body.slice(lead![0].length);
    } else if (h1 && /\.(md|markdown|mdown)$/i.test(path)) {
      title = h1.replace(NOTION_ID, "");
      rest = body.slice(lead![0].length);
    } else {
      title = stem;
    }
    pages.push({ path, title: title || "Untitled", body: rest, tags: fm.tags });
  }
  for (const f of csvKeep) {
    pages.push({
      path: f.path,
      title: cleanName(basename(f.path)) || "Database",
      body: "",
      tags: [],
      csv: parseCsv(decoder.decode(f.bytes)),
    });
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));

  const ctx: Ctx = {
    source,
    titleByPath: new Map(),
    titleByName: new Map(),
    images: new Map(),
    missingAttachments: new Set(),
  };
  for (const p of pages) {
    ctx.titleByPath.set(p.path.toLowerCase(), p.title);
    const key = cleanName(basename(p.path)).toLowerCase();
    if (!ctx.titleByName.has(key)) ctx.titleByName.set(key, p.title);
    const tkey = p.title.toLowerCase();
    if (!ctx.titleByName.has(tkey)) ctx.titleByName.set(tkey, p.title);
  }
  for (const img of imageFiles) {
    if (img.bytes.length > MAX_INLINE_IMAGE) {
      skipped++;
      continue;
    }
    const url = `data:${mimeFor(img.path)};base64,${toBase64(img.bytes)}`;
    ctx.images.set(img.path.toLowerCase(), url);
    const name = basename(img.path).toLowerCase();
    if (!ctx.images.has(name)) ctx.images.set(name, url);
  }

  // ---- folders: first directory below the shared root ----
  const root = commonDir(pages.map((p) => p.path));
  const rootName = root ? cleanName(basename(root)) : null;
  const folderIdByName = new Map(
    existing.folders.map((f) => [f.name.toLowerCase(), f.id]),
  );
  const newFolders: Folder[] = [];
  const folderFor = (name: string | null): string | null => {
    if (!name) return null;
    const hit = folderIdByName.get(name.toLowerCase());
    if (hit) return hit;
    const f: Folder = { id: newId(), name };
    newFolders.push(f);
    folderIdByName.set(name.toLowerCase(), f.id);
    return f.id;
  };
  const topDirs = new Set(
    pages
      .map((p) => p.path.slice(root ? root.length + 1 : 0))
      .filter((rel) => rel.includes("/"))
      .map((rel) => cleanName(rel.split("/")[0]).toLowerCase()),
  );
  const folderNameOf = (path: string): string | null => {
    const rel = path.slice(root ? root.length + 1 : 0);
    if (rel.includes("/")) return cleanName(rel.split("/")[0]) || rootName;
    // A Notion parent page sits next to the folder holding its children.
    const stem = cleanName(basename(rel));
    if (topDirs.has(stem.toLowerCase())) return stem;
    return rootName;
  };

  // ---- pages → docs ----
  const existingKeys = new Set(
    existing.docs.map((d) => `${d.title.trim()}\n${d.content.trim()}`),
  );
  const docs: Doc[] = [];
  let duplicates = 0;
  const now = Date.now();
  pages.forEach((p, i) => {
    let content: string;
    if (p.csv) {
      const [head, ...rows] = p.csv;
      if (!head) return;
      const width = head.length;
      const lines = [
        `| ${head.map(tableCell).join(" | ")} |`,
        `| ${head.map(() => "---").join(" | ")} |`,
        ...rows.map((r) => {
          const cells = Array.from({ length: width }, (_, c) => tableCell(r[c] ?? ""));
          // Row pages of a Notion database: link the title cell.
          const t = cells[0] && ctx.titleByName.get(cells[0].toLowerCase());
          if (t) cells[0] = wikilink(t);
          return `| ${cells.join(" | ")} |`;
        }),
      ];
      content = `${rows.length} ${rows.length === 1 ? "entry" : "entries"} · imported database\n\n${lines.join("\n")}`;
    } else {
      content = convertBody(p.body, dirname(p.path), ctx);
      if (p.tags.length > 0) {
        content = `Tags: ${p.tags.map((t) => `#${t}`).join(" ")}\n\n${content}`;
      }
    }
    const key = `${p.title.trim()}\n${content.trim()}`;
    if (existingKeys.has(key)) {
      duplicates++;
      return;
    }
    existingKeys.add(key);
    docs.push({
      id: newId(),
      folderId: folderFor(folderNameOf(p.path)),
      title: p.title,
      content,
      pinned: false,
      // Keep the import order stable in "recent" lists.
      updatedAt: now - i,
    });
  });

  skipped += ctx.missingAttachments.size;
  const used = new Set(docs.map((d) => d.folderId));
  return {
    docs,
    folders: newFolders.filter((f) => used.has(f.id)),
    source,
    skipped,
    duplicates,
  };
}

/* ---------- collecting files from the browser ---------- */

async function readFile(file: File, path: string): Promise<RawFile> {
  if (isIgnored(normPath(path))) return { path, bytes: new Uint8Array() };
  return { path, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Files from an <input type="file"> (with or without webkitdirectory). */
export async function filesFromList(list: FileList | File[]): Promise<RawFile[]> {
  const files = Array.from(list).slice(0, MAX_FILES);
  return Promise.all(
    files.map((f) => readFile(f, f.webkitRelativePath || f.name)),
  );
}

type Entry = FileSystemEntry;

function readDir(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader();
  const out: Entry[] = [];
  return new Promise((resolve) => {
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) return resolve(out);
          out.push(...batch);
          next();
        },
        () => resolve(out),
      );
    next();
  });
}

/** Walks dropped files and folders (folders recursively). */
export async function filesFromDrop(drop: {
  entries: Entry[];
  files: File[];
}): Promise<RawFile[]> {
  if (drop.entries.length === 0) return filesFromList(drop.files);
  const out: RawFile[] = [];
  const walk = async (e: Entry, prefix: string) => {
    if (out.length >= MAX_FILES) return;
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory) {
      // Don't descend into .obsidian/.git — just note that it exists.
      if (e.name.startsWith(".")) {
        out.push({ path: `${path}/_`, bytes: new Uint8Array() });
        return;
      }
      for (const child of await readDir(e as FileSystemDirectoryEntry)) {
        await walk(child, path);
      }
    } else {
      const file = await new Promise<File | null>((resolve) =>
        (e as FileSystemFileEntry).file(resolve, () => resolve(null)),
      );
      if (file) out.push(await readFile(file, path));
    }
  };
  for (const e of drop.entries) await walk(e, "");
  return out;
}
