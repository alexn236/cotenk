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
const KEY_KEY = "cotenk.devin-api-key";

export function storedWorkspaceDir(): string | null {
  try {
    return localStorage.getItem(DIR_KEY);
  } catch {
    return null;
  }
}

export function storeWorkspaceDir(dir: string) {
  try {
    localStorage.setItem(DIR_KEY, dir);
  } catch {
    /* storage unavailable */
  }
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

/** Stored choice, else the platform default (~/Documents/CoTenk). */
export async function resolveWorkspaceDir(): Promise<string> {
  return storedWorkspaceDir() ?? (await invoke<string>("workspace_dir"));
}
