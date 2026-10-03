import { invoke } from "@tauri-apps/api/core";

/**
 * Desktop-only settings: which local folder the pages and agents live
 * in, and an optional Devin API key override.
 */

const DIR_KEY = "cotenk.workspace-dir";

/** True inside the Tauri desktop shell (agents + local folder sync). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const DESKTOP_ONLY_MESSAGE =
  "Agents run locally on your machine — open CoTenk in the desktop app to connect one.";

/** Where the web app sends people for the desktop app (agents). */
export const DESKTOP_DOWNLOAD_URL =
  (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined) ??
  "https://github.com/alexn236/cotenk/releases/latest";

/** Opens an http(s)/mailto link in the system browser (never in-app). */
export function openExternal(url: string) {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  if (isDesktop()) {
    void invoke("open_url", { url }).catch(() => {});
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const KEY_KEY = "cotenk.devin-api-key";

/** Key the folder choice is stored under (scoped name kept for upgrades). */
const SCOPED_DIR_KEY = `${DIR_KEY}:local`;

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function storedWorkspaceDir(): string | null {
  return readLs(SCOPED_DIR_KEY) ?? readLs(DIR_KEY);
}

export function storeWorkspaceDir(dir: string) {
  writeLs(SCOPED_DIR_KEY, dir);
}

export function apiKeyOverride(): string | null {
  try {
    return localStorage.getItem(KEY_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function storeApiKeyOverride(key: string | null) {
  try {
    if (key?.trim()) localStorage.setItem(KEY_KEY, key.trim());
    else localStorage.removeItem(KEY_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type DevinStatus = {
  binary: boolean;
  version: string | null;
  authed: boolean;
};

export function devinStatus(): Promise<DevinStatus> {
  return invoke<DevinStatus>("devin_status");
}

/**
 * The workspace folder: the one picked in Settings → Agents, else
 * ~/Documents/CoTenk (remembered on first use).
 */
export async function resolveWorkspaceDir(): Promise<string> {
  const own = storedWorkspaceDir();
  if (own) return own;
  const dir = await invoke<string>("workspace_dir");
  writeLs(SCOPED_DIR_KEY, dir);
  return dir;
}
