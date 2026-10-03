import { strToU8, zipSync } from "fflate";
import { useWorkspace } from "./store";
import { useAgent } from "./agent-store";
import { saveBytes } from "./files";
import { readAsset } from "./images";
import { isDesktop } from "./workspace";
import type { Doc, Folder } from "./types";

/**
 * Workspace export (ZIP of markdown + attachments) and wiping the data
 * this app keeps on the device.
 */

const REF_RE = /cotenk-(?:image|file):([^)\s"#]+)(?:#[^)\s"]*)?/g;

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

  if (found.size > 0 && isDesktop()) {
    let done = 0;
    for (const path of found) {
      onProgress?.(`Collecting attachments (${++done}/${found.size})…`);
      try {
        files[`assets/${path.split("/").pop()}`] = await readAsset(path);
      } catch {
        /* missing on disk — the link stays in the page */
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

/* ---------- local data ---------- */

/**
 * Removes everything this app stored in the browser (pages cache, chats,
 * history, settings) and reloads into a fresh workspace. The workspace
 * folder on disk is left alone.
 */
export function clearLocalData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("cotenk")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  window.location.reload();
}
