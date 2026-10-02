import { getSupabase } from "./supabase";
import { useAuth } from "./auth-store";
import { useWorkspace } from "./store";
import type { Doc } from "./types";

/**
 * Version history and "recently deleted". The rows are written by a
 * database trigger (see 20261005_history_cleanup_account.sql), so they
 * exist regardless of which device or client changed the page.
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

type Row = {
  id: number;
  doc_id: string;
  folder_id: string | null;
  parent_id: string | null;
  title: string;
  content: string;
  pinned: boolean;
  reason: "edit" | "delete";
  doc_updated_at: number | string;
  created_at: string;
};

const toVersion = (r: Row): Version => ({
  id: r.id,
  docId: r.doc_id,
  folderId: r.folder_id,
  parentId: r.parent_id,
  title: r.title,
  content: r.content,
  pinned: r.pinned,
  reason: r.reason,
  docUpdatedAt: Number(r.doc_updated_at) || 0,
  createdAt: new Date(r.created_at).getTime(),
});

const workspaceId = () => {
  const { status, workspaceId: ws } = useAuth.getState();
  return status === "signedIn" ? ws : null;
};

/** Whether history exists for this session (signed in with a workspace). */
export const historyAvailable = () => !!workspaceId();

export async function listVersions(docId: string): Promise<Version[]> {
  const ws = workspaceId();
  if (!ws) return [];
  const { data, error } = await getSupabase()
    .from("doc_versions")
    .select("*")
    .eq("workspace_id", ws)
    .eq("doc_id", docId)
    .eq("reason", "edit")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toVersion);
}

/** Last state of every page deleted in the past 60 days that isn't back. */
export async function listTrash(): Promise<Version[]> {
  const ws = workspaceId();
  if (!ws) return [];
  const { data, error } = await getSupabase()
    .from("doc_versions")
    .select("*")
    .eq("workspace_id", ws)
    .eq("reason", "delete")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const present = new Set(useWorkspace.getState().docs.map((d) => d.id));
  const seen = new Set<string>();
  return ((data ?? []) as Row[]).map(toVersion).filter((v) => {
    if (present.has(v.docId) || seen.has(v.docId)) return false;
    seen.add(v.docId);
    return true;
  });
}

export async function purgeVersion(id: number): Promise<void> {
  const { error } = await getSupabase().from("doc_versions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Puts an older version back. The current state is saved as a version
 * first, so a restore can itself be undone from the history.
 */
export async function restoreVersion(doc: Doc, v: Version): Promise<void> {
  const ws = workspaceId();
  if (ws) {
    const { error } = await getSupabase().from("doc_versions").insert({
      workspace_id: ws,
      doc_id: doc.id,
      folder_id: doc.folderId,
      parent_id: doc.parentId ?? null,
      title: doc.title,
      content: doc.content,
      pinned: doc.pinned,
      reason: "edit",
      doc_updated_at: doc.updatedAt,
    });
    if (error) throw new Error(error.message);
  }
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
