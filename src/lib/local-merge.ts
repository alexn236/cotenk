import type { Doc, Folder } from "./types";
import { seedDocs } from "./mock-docs";
import { newId } from "./ids";
import { useWorkspace } from "./store";
import { loadLocalWorkspace, saveLocalWorkspace } from "./local-workspace";

/**
 * Moving pages from this device's local workspace into an account.
 *
 * Signed out, pages live only on the device. An account has its own
 * workspace — nothing crosses over on its own any more (signing in on a
 * shared machine used to pull the previous person's pages into the new
 * account). After the first pull the user is asked once which local
 * pages to bring along.
 */

export type MergeOffer = { docs: Doc[]; folders: Folder[] };

const declinedKey = (userId: string) => `cotenk-merge-declined:${userId}`;

function readDeclined(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(declinedKey(userId));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeDeclined(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(declinedKey(userId), JSON.stringify([...ids]));
  } catch {
    /* storage unavailable */
  }
}

// Seed pages carry relative due dates — compare them date-agnostic.
const norm = (s: string) => s.replace(/due:\d{4}-\d{2}-\d{2}/g, "due:");

/**
 * Local pages worth offering: not an untouched seed page, not already
 * in the account with the same content, not declined before.
 */
export function mergeOffer(userId: string): MergeOffer | null {
  const local = loadLocalWorkspace();
  if (!local) return null;
  const { docs: accountDocs } = useWorkspace.getState();
  const declined = readDeclined(userId);
  const seedById = new Map(seedDocs.map((d) => [d.id, d]));
  const accountById = new Map(accountDocs.map((d) => [d.id, d]));

  const docs = local.docs.filter((d) => {
    if (declined.has(d.id)) return false;
    const seed = seedById.get(d.id);
    if (seed && seed.title === d.title && norm(seed.content) === norm(d.content)) {
      return false;
    }
    const twin = accountById.get(d.id);
    return !(twin && twin.title === d.title && twin.content === d.content);
  });
  if (docs.length === 0) return null;
  const used = new Set(docs.map((d) => d.folderId).filter(Boolean));
  return { docs, folders: local.folders.filter((f) => used.has(f.id)) };
}

/**
 * Adds the offered pages to the account workspace (the sync uploads
 * them) and removes them from the device's local workspace. Pages whose
 * id the account already uses (edited seed pages) get a fresh id;
 * folders are matched by id, then by name.
 */
export function acceptMerge(offer: MergeOffer) {
  const st = useWorkspace.getState();
  const folderMap = new Map<string, string>();
  const newFolders: Folder[] = [];
  for (const f of offer.folders) {
    const match =
      st.folders.find((x) => x.id === f.id) ??
      st.folders.find((x) => x.name.toLowerCase() === f.name.toLowerCase());
    if (match) {
      folderMap.set(f.id, match.id);
    } else {
      newFolders.push(f);
      folderMap.set(f.id, f.id);
    }
  }
  const taken = new Set(st.docs.map((d) => d.id));
  const now = Date.now();
  const moved = offer.docs.map((d) => ({
    ...d,
    id: taken.has(d.id) ? newId() : d.id,
    folderId: d.folderId ? (folderMap.get(d.folderId) ?? null) : null,
    updatedAt: now,
  }));
  useWorkspace.setState({
    folders: [...st.folders, ...newFolders],
    docs: [...moved, ...st.docs],
  });

  const local = loadLocalWorkspace();
  if (local) {
    const ids = new Set(offer.docs.map((d) => d.id));
    saveLocalWorkspace({
      docs: local.docs.filter((d) => !ids.has(d.id)),
      folders: local.folders,
    });
  }
}

/** Don't offer these pages to this account again. */
export function declineMerge(userId: string, offer: MergeOffer) {
  const declined = readDeclined(userId);
  offer.docs.forEach((d) => declined.add(d.id));
  writeDeclined(userId, declined);
}
