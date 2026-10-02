import type { Doc, Folder } from "./types";

/**
 * The device's own workspace (signed out), cached in the browser.
 * Accounts are backed by Supabase (and their own folder on desktop) and
 * never write here; after signing in, the merge dialog offers to move
 * pages from here into the account (see local-merge.ts).
 */

const KEY = "cotenk-local-workspace";

export type LocalWorkspace = { docs: Doc[]; folders: Folder[] };

export function loadLocalWorkspace(): LocalWorkspace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LocalWorkspace>;
    if (!Array.isArray(v.docs) || !Array.isArray(v.folders)) return null;
    return { docs: v.docs, folders: v.folders };
  } catch {
    return null;
  }
}

export function saveLocalWorkspace(ws: LocalWorkspace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    /* storage unavailable or full */
  }
}

export function clearLocalWorkspace() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
