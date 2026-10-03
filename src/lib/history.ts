import { useWorkspace } from "./store";
import type { Doc } from "./types";

/**
 * Version history and "recently deleted", kept on this device
 * (localStorage). A version is the state a page had right before someone
 * — you, an agent or the file mirror — started changing it again after a
 * pause; deleting a page keeps its last state for 60 days.
 */

export type Version = {
  id: number;
  docId: string;
  folderId: string | null;
  parentId: string | null;
  title: string;
  content: string;
  pinned: boolean;
  reason: "edit" | "delete";
  docUpdatedAt: number;
  createdAt: number;
};

const KEY = "cotenk-history";
/** Editing again after this long starts a new version. */
const PAUSE_MS = 10 * 60_000;
const KEEP_DELETED_MS = 60 * 24 * 60 * 60_000;
const PER_DOC = 40;
const MAX_TOTAL = 600;

function load(): Version[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as Version[]) : [];
  } catch {
    return [];
  }
}

function save(list: Version[]) {
  let out = list;
  // Storage full: drop the oldest half until it fits.
  for (let i = 0; i < 6; i++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
      return;
    } catch {
      if (out.length < 2) return;
      out = out.slice(0, Math.ceil(out.length / 2));
    }
  }
}

/** Newest first; trimmed per page, by age (deleted) and in total. */
function prune(list: Version[]): Version[] {
  const cutoff = Date.now() - KEEP_DELETED_MS;
  const perDoc = new Map<string, number>();
  return list
    .filter((v) => {
      if (v.reason === "delete") return v.createdAt >= cutoff;
      const n = (perDoc.get(v.docId) ?? 0) + 1;
      perDoc.set(v.docId, n);
      return n <= PER_DOC;
    })
    .slice(0, MAX_TOTAL);
}

let seq = 0;
const nextId = () => Date.now() * 1000 + (seq++ % 1000);

function record(entries: Version[]) {
  if (entries.length === 0) return;
  save(prune([...entries, ...load()]));
}

const versionOf = (d: Doc, reason: Version["reason"]): Version => ({
  id: nextId(),
  docId: d.id,
  folderId: d.folderId,
  parentId: d.parentId ?? null,
  title: d.title,
  content: d.content,
  pinned: d.pinned,
  reason,
  docUpdatedAt: d.updatedAt,
  createdAt: Date.now(),
});

/** Records versions while the app runs. Returns a dispose function. */
export function initHistory(): () => void {
  /** Last time each page changed in this session. */
  const lastChange = new Map<string, number>();
  return useWorkspace.subscribe((s, prev) => {
    if (s.docs === prev.docs) return;
    const now = Date.now();
    const before = new Map(prev.docs.map((d) => [d.id, d]));
    const entries: Version[] = [];
    const present = new Set<string>();
    for (const d of s.docs) {
      present.add(d.id);
      const old = before.get(d.id);
      if (!old || old === d) continue;
      if (old.content === d.content && old.title === d.title) continue;
      const last = lastChange.get(d.id) ?? 0;
      lastChange.set(d.id, now);
      // First change after a pause: keep what the page looked like.
      if (now - last > PAUSE_MS && (old.content.trim() || old.title.trim())) {
        entries.push(versionOf(old, "edit"));
      }
    }
    for (const old of prev.docs) {
      if (!present.has(old.id)) entries.push(versionOf(old, "delete"));
    }
    record(entries);
  });
}

export async function listVersions(docId: string): Promise<Version[]> {
  return load().filter((v) => v.docId === docId && v.reason === "edit");
}

/** Last state of every page deleted in the past 60 days that isn't back. */
export async function listTrash(): Promise<Version[]> {
  const present = new Set(useWorkspace.getState().docs.map((d) => d.id));
  const seen = new Set<string>();
  return load().filter((v) => {
    if (v.reason !== "delete" || present.has(v.docId) || seen.has(v.docId)) {
      return false;
    }
    seen.add(v.docId);
    return true;
  });
}

export async function purgeVersion(id: number): Promise<void> {
  const list = load();
  const target = list.find((v) => v.id === id);
  // A deleted page goes for good — every delete entry of it.
  save(
    list.filter((v) =>
      target?.reason === "delete"
        ? !(v.reason === "delete" && v.docId === target.docId)
        : v.id !== id,
    ),
  );
}

/**
 * Puts an older version back. The current state is saved as a version
 * first, so a restore can itself be undone from the history.
 */
export async function restoreVersion(doc: Doc, v: Version): Promise<void> {
  record([versionOf(doc, "edit")]);
  useWorkspace.setState((s) => ({
    docs: s.docs.map((d) =>
      d.id === doc.id
        ? { ...d, title: v.title, content: v.content, updatedAt: Date.now() }
        : d,
    ),
  }));
}

/** Brings a deleted page back (same id, folder if it still exists). */
export function restoreDeleted(v: Version) {
  useWorkspace.getState().restoreDoc(
    {
      id: v.docId,
      folderId: v.folderId,
      parentId: v.parentId,
      title: v.title,
      content: v.content,
      pinned: v.pinned,
      updatedAt: Date.now(),
    },
    0,
  );
}
