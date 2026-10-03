import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { newId } from "./ids";
import { saveBytes } from "./files";
import { isDesktop, resolveWorkspaceDir } from "./workspace";

/**
 * Images and files in pages and agent chats, stored locally.
 *
 * Desktop: the file goes into the workspace folder (`assets/…`), next to
 * the pages, and markdown keeps `cotenk-image:assets/<name>` — agents see
 * the same files. In the browser there is no folder, so a small image is
 * embedded as a data URL and files can't be attached.
 */

export const IMAGE_REF = "cotenk-image:";
const ASSETS_DIR = "assets";
const MAX_INPUT = 25 * 1024 * 1024;
const MAX_GIF = 10 * 1024 * 1024;
const INLINE_MAX = 600 * 1024;

export const isImageFile = (f: File) =>
  /^image\/(png|jpe?g|gif|webp)$/i.test(f.type);

export const imageFiles = (list: FileList | File[] | null | undefined) =>
  Array.from(list ?? []).filter(isImageFile);

function canvasBlob(canvas: HTMLCanvasElement, type: string, q: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't process the image."))),
      type,
      q,
    ),
  );
}

/** Shrinks big images (long side ≤ 1920, 1200 when kept inside the page). */
export async function prepareImage(file: File): Promise<Blob> {
  if (!isImageFile(file)) throw new Error("That file isn't a supported image.");
  if (file.size > MAX_INPUT) throw new Error("That image is larger than 25 MB.");
  const onDisk = isDesktop();
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF) throw new Error("That GIF is larger than 10 MB.");
    if (onDisk || file.size <= INLINE_MAX) return file;
    throw new Error("Larger GIFs need the desktop app.");
  }
  const maxSide = onDisk ? 1920 : 1200;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 300 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas, "image/webp", onDisk ? 0.86 : 0.72);
  } finally {
    bitmap.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read the image."));
    r.readAsDataURL(blob);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return (await blobToDataUrl(blob)).replace(/^data:[^,]*,/, "");
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Absolute path of a workspace-relative asset path. Refuses anything that
 * could point outside the workspace folder.
 */
async function assetPath(rel: string): Promise<string> {
  const clean = rel.replace(/\\/g, "/");
  if (!clean || clean.startsWith("/") || /^[a-z]:/i.test(clean) || clean.split("/").includes("..")) {
    throw new Error("Invalid file reference.");
  }
  const root = (await resolveWorkspaceDir()).replace(/[\\/]+$/, "");
  return `${root}/${clean}`;
}

async function writeAsset(rel: string, blob: Blob) {
  await invoke("fs_write_b64", {
    path: await assetPath(rel),
    data: await blobToBase64(blob),
  });
}

export async function readAsset(rel: string): Promise<Uint8Array> {
  const b64 = await invoke<string>("fs_read_b64", { path: await assetPath(rel) });
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Saves an image and returns the reference to put in markdown / a message. */
export async function storeImage(
  blob: Blob,
  kind: "note" | "chat",
): Promise<string> {
  if (!isDesktop()) {
    if (blob.size > INLINE_MAX) {
      throw new Error("Larger images need the desktop app.");
    }
    return blobToDataUrl(blob);
  }
  const rel = `${ASSETS_DIR}/${kind === "chat" ? "chat/" : ""}${newId()}.${EXT[blob.type] ?? "webp"}`;
  await writeAsset(rel, blob);
  const ref = IMAGE_REF + rel;
  cache.set(ref, URL.createObjectURL(blob));
  return ref;
}

/* ---------- image blocks: `![caption](ref#w=480)` ---------- */

const IMAGE_MD = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/;

export type ImageMd = { alt: string; ref: string; width: number | null };

export function parseImageMd(md: string): ImageMd | null {
  const m = IMAGE_MD.exec(md.trim());
  if (!m) return null;
  const [ref, frag = ""] = m[2].split("#");
  const w = /(?:^|&)w=(\d{2,5})/.exec(frag)?.[1];
  return { alt: m[1], ref, width: w ? Number(w) : null };
}

export function buildImageMd({ alt, ref, width }: ImageMd): string {
  const a = alt.replace(/[[\]()\n]/g, " ");
  return `![${a}](${ref}${width ? `#w=${Math.round(width)}` : ""})`;
}

/* ---------- file attachments: `[name](cotenk-file:path#s=bytes)` ---------- */

export const FILE_REF = "cotenk-file:";
const FILE_MD = /^\[([^\]\n]+)\]\(cotenk-file:([^)\s#]+)(?:#s=(\d+))?\)$/;
const MAX_FILE = 25 * 1024 * 1024;

export type FileMd = { name: string; path: string; size: number | null };

export function parseFileMd(md: string): FileMd | null {
  const m = FILE_MD.exec(md.trim());
  return m ? { name: m[1], path: m[2], size: m[3] ? Number(m[3]) : null } : null;
}

/** Copies any file into the workspace folder and returns its markdown. */
export async function storeFile(file: File): Promise<string> {
  if (!isDesktop()) throw new Error("Attaching files needs the desktop app.");
  if (file.size > MAX_FILE) throw new Error("Files can be up to 25 MB.");
  const safe =
    file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) ||
    "file";
  const rel = `${ASSETS_DIR}/files/${newId()}-${safe}`;
  await writeAsset(rel, file);
  const label = file.name.replace(/[[\]\n]/g, " ").trim() || "file";
  return `[${label}](${FILE_REF}${rel}#s=${file.size})`;
}

/** Saves a copy of an attached file wherever the user picks. */
export async function downloadFile(path: string, name: string): Promise<void> {
  if (!isDesktop()) throw new Error("Attached files open in the desktop app.");
  const bytes = await readAsset(path);
  await saveBytes(name, bytes, "application/octet-stream");
}

/** File name without extension, safe inside `![alt](…)`. */
export const imageAlt = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[[\]()\n]/g, " ")
    .trim()
    .slice(0, 60);

/* ---------- showing references ---------- */

/** Object URLs of images read from disk this session. */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function resolveRef(ref: string): Promise<string> {
  const hit = cache.get(ref);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(ref);
  if (!p) {
    p = (async () => {
      if (!isDesktop()) throw new Error("not available");
      const rel = ref.slice(IMAGE_REF.length);
      const bytes = await readAsset(rel);
      const ext = rel.split(".").pop()?.toLowerCase() ?? "";
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: MIME[ext] ?? "image/webp" }),
      );
      cache.set(ref, url);
      return url;
    })().finally(() => pending.delete(ref));
    pending.set(ref, p);
  }
  return p;
}

/** Usable `src` for an image reference; `null` while loading or if missing. */
export function useImageSrc(raw: string | undefined): string | null | undefined {
  // `#w=480` (display width) is not part of the stored path.
  const src = raw?.startsWith(IMAGE_REF) ? raw.split("#")[0] : raw;
  const isRef = !!src?.startsWith(IMAGE_REF);
  const ready = isRef && src ? (cache.get(src) ?? null) : null;
  const [resolved, setResolved] = useState<{ ref: string; url: string | null }>();

  useEffect(() => {
    if (!isRef || !src || ready) return;
    let live = true;
    resolveRef(src)
      .then((url) => live && setResolved({ ref: src, url }))
      .catch(() => live && setResolved({ ref: src, url: null }));
    return () => {
      live = false;
    };
  }, [isRef, src, ready]);

  if (!isRef) return src;
  if (ready) return ready;
  return resolved && resolved.ref === src ? resolved.url : null;
}
