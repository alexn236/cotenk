import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-store";
import { newId } from "./ids";

/**
 * Images in pages and agent chats. Signed in, the file goes to the private
 * Supabase bucket `note-images` (folder = workspace id) and the markdown /
 * chat message keeps `cotenk-image:<path>`. Signed out there is no cloud, so
 * a small data URL is embedded instead.
 */

export const IMAGE_REF = "cotenk-image:";
export const BUCKET = "note-images";
const MAX_INPUT = 25 * 1024 * 1024;
const MAX_GIF = 10 * 1024 * 1024;
const INLINE_MAX = 600 * 1024;

export const isImageFile = (f: File) =>
  /^image\/(png|jpe?g|gif|webp)$/i.test(f.type);

export const imageFiles = (list: FileList | File[] | null | undefined) =>
  Array.from(list ?? []).filter(isImageFile);

const signedInWorkspace = () => {
  const { status, workspaceId } = useAuth.getState();
  return status === "signedIn" ? workspaceId : null;
};

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
  const cloud = !!signedInWorkspace();
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF) throw new Error("That GIF is larger than 10 MB.");
    if (cloud || file.size <= INLINE_MAX) return file;
    throw new Error("Sign in to add larger GIFs.");
  }
  const maxSide = cloud ? 1920 : 1200;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 300 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas, "image/webp", cloud ? 0.86 : 0.72);
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

/** Saves an image and returns the reference to put in markdown / a message. */
export async function storeImage(
  blob: Blob,
  kind: "note" | "chat",
): Promise<string> {
  const ws = signedInWorkspace();
  if (!ws) {
    if (blob.size > INLINE_MAX) {
      throw new Error("Sign in to add larger images.");
    }
    return blobToDataUrl(blob);
  }
  const path = `${ws}/${kind}/${newId()}.${EXT[blob.type] ?? "webp"}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw new Error(`Couldn't upload the image: ${error.message}`);
  const ref = IMAGE_REF + path;
  cache.set(ref, { url: URL.createObjectURL(blob), exp: Infinity });
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

/** Uploads any file (account storage only) and returns its markdown. */
export async function storeFile(file: File): Promise<string> {
  const ws = signedInWorkspace();
  if (!ws) throw new Error("Sign in to attach files.");
  if (file.size > MAX_FILE) throw new Error("Files can be up to 25 MB.");
  const safe =
    file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) ||
    "file";
  const path = `${ws}/file/${newId()}-${safe}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "31536000",
    });
  if (error) throw new Error(`Couldn't upload the file: ${error.message}`);
  const label = file.name.replace(/[[\]\n]/g, " ").trim() || "file";
  return `[${label}](${FILE_REF}${path}#s=${file.size})`;
}

/** A short-lived link that downloads the stored file. */
export async function fileDownloadUrl(path: string, name: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, 120, { download: name });
  if (error || !data) throw new Error(error?.message ?? "File not found.");
  return data.signedUrl;
}

/** File name without extension, safe inside `![alt](…)`. */
export const imageAlt = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[[\]()\n]/g, " ")
    .trim()
    .slice(0, 60);

/* ---------- showing references ---------- */

const cache = new Map<string, { url: string; exp: number }>();
const pending = new Map<string, Promise<string>>();
const SIGNED_FOR = 3600;

function resolveRef(ref: string): Promise<string> {
  const hit = cache.get(ref);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
  let p = pending.get(ref);
  if (!p) {
    p = (async () => {
      const { data, error } = await getSupabase()
        .storage.from(BUCKET)
        .createSignedUrl(ref.slice(IMAGE_REF.length), SIGNED_FOR);
      if (error || !data) throw new Error(error?.message ?? "not found");
      cache.set(ref, {
        url: data.signedUrl,
        exp: Date.now() + (SIGNED_FOR - 300) * 1000,
      });
      return data.signedUrl;
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
  const cached = isRef && src ? cache.get(src) : undefined;
  const [resolved, setResolved] = useState<{ ref: string; url: string | null }>();
  const ready = cached && cached.exp > Date.now() ? cached.url : null;

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
