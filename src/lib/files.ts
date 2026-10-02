import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { isDesktop } from "./workspace";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Hands a generated file to the user: a save dialog on the desktop, a
 * download in the browser. Resolves false when the dialog was cancelled.
 */
export async function saveBytes(
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<boolean> {
  if (isDesktop()) {
    const ext = name.split(".").pop() ?? "";
    const path = await save({
      defaultPath: name,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
    });
    if (!path) return false;
    await invoke("fs_write_b64", { path, data: toBase64(bytes) });
    return true;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
