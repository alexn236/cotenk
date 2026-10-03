import type { Doc, Folder } from "./types";

/**
 * The workspace, cached in the browser. On desktop it is also mirrored
 * to the workspace folder (see file-sync.ts).
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
