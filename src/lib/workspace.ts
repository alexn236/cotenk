import { invoke } from "@tauri-apps/api/core";

/**
 * Desktop-only settings that live outside Supabase: which local folder
 * the agent works in, and an optional API key override for auth.
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

/**
 * Whose workspace folder is active: "local" (signed out — the pages that
 * live only on this device) or an account's user id. Every scope gets
 * its own folder, so signing in or out never mixes two people's pages
 * on disk, and agents always run in the folder of whoever is signed in.
 */
let scope = "local";
let scopeLabel = "";

/** Called by the session gate on sign-in/out. */
export function setWorkspaceScope(next: string, label = "") {
  scope = next;
  scopeLabel = label;
}

export function workspaceScope(): string {
  return scope;
}

const dirKey = (s: string) => `${DIR_KEY}:${s}`;
/** Set once the pre-scope folder setting has been handed to its owner. */
const MIGRATED_KEY = "cotenk.workspace-dir-migrated";

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

/** Comparison form of a folder path (separators and case folded). */
const samePathKey = (p: string) => p.replace(/\\/g, "/").toLowerCase();

/** Folders already claimed by some scope on this device. */
function claimedDirs(): Set<string> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${DIR_KEY}:`)) {
        const v = localStorage.getItem(k);
        if (v) out.add(samePathKey(v));
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

export function storedWorkspaceDir(): string | null {
  return readLs(dirKey(scope));
}

export function storeWorkspaceDir(dir: string) {
  writeLs(dirKey(scope), dir);
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
 * Folder of the active scope. First use picks (and remembers) a default:
 *
 *  - Whoever uses the app first after this update inherits the folder
 *    the app used before (the chosen one, else ~/Documents/CoTenk) —
 *    that's where their pages already are.
 *  - Otherwise signed out uses ~/Documents/CoTenk and an account uses
 *    "~/Documents/CoTenk (name)", never a folder another scope owns.
 */
export async function resolveWorkspaceDir(): Promise<string> {
  const own = readLs(dirKey(scope));
  if (own) return own;
  const base = await invoke<string>("workspace_dir");
  let dir: string;
  if (!readLs(MIGRATED_KEY)) {
    dir = readLs(DIR_KEY) ?? base;
  } else {
    const taken = claimedDirs();
    const free = (p: string) => !taken.has(samePathKey(p));
    const label =
      scope === "local"
        ? "Local"
        : scopeLabel.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 40) ||
          scope.slice(0, 8);
    const first = scope === "local" ? base : `${base} (${label})`;
    dir = first;
    for (let i = 2; !free(dir); i++) dir = `${base} (${label} ${i})`;
  }
  writeLs(MIGRATED_KEY, "1");
  writeLs(dirKey(scope), dir);
  return dir;
}
