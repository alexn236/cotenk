import { getSupabase } from "./supabase";
import { useWorkspace } from "./store";
import type { Doc, Folder } from "./types";

type DocRow = {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  pinned: boolean;
  updated_at: number | string;
};

type FolderRow = {
  id: string;
  name: string;
};

const toDoc = (r: DocRow): Doc => ({
  id: r.id,
  folderId: r.folder_id,
  title: r.title,
  content: r.content,
  pinned: r.pinned,
  updatedAt: Number(r.updated_at),
});

const toFolder = (r: FolderRow): Folder => ({ id: r.id, name: r.name });

const FLUSH_DEBOUNCE_MS = 900;

/**
 * Bidirectional sync for one signed-in user. Pulls the remote workspace
 * once, then pushes every local docs/folders change (debounced upserts
 * plus deletes for rows that vanished locally). Returns an unsubscribe
 * function — call it when the session ends.
 */
export function initSync(userId: string): () => void {
  const sb = getSupabase();
  const store = useWorkspace;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let dirty = false;
  let disposed = false;

  const setSyncStatus = (s: "idle" | "syncing" | "synced" | "error") =>
    store.setState({ syncStatus: s });

  const flush = async () => {
    if (flushing) {
      dirty = true;
      return;
    }
    flushing = true;
    dirty = false;
    setSyncStatus("syncing");
    try {
      const { docs, folders } = store.getState();

      // Folders first: docs reference them via folder_id.
      if (folders.length > 0) {
        const { error } = await sb.from("folders").upsert(
          folders.map((f) => ({ id: f.id, user_id: userId, name: f.name })),
        );
        if (error) throw error;
      }
      const { data: remoteFolders, error: rfErr } = await sb
        .from("folders")
        .select("id");
      if (rfErr) throw rfErr;
      const folderIds = new Set(folders.map((f) => f.id));
      const staleFolders = (remoteFolders ?? [])
        .map((r) => r.id as string)
        .filter((id) => !folderIds.has(id));
      if (staleFolders.length > 0) {
        const { error } = await sb
          .from("folders")
          .delete()
          .in("id", staleFolders);
        if (error) throw error;
      }

      if (docs.length > 0) {
        const { error } = await sb.from("docs").upsert(
          docs.map((d) => ({
            id: d.id,
            user_id: userId,
            folder_id: d.folderId,
            title: d.title,
            content: d.content,
            pinned: d.pinned,
            updated_at: d.updatedAt,
          })),
        );
        if (error) throw error;
      }
      const { data: remoteDocs, error: rdErr } = await sb
        .from("docs")
        .select("id");
      if (rdErr) throw rdErr;
      const docIds = new Set(docs.map((d) => d.id));
      const staleDocs = (remoteDocs ?? [])
        .map((r) => r.id as string)
        .filter((id) => !docIds.has(id));
      if (staleDocs.length > 0) {
        const { error } = await sb.from("docs").delete().in("id", staleDocs);
        if (error) throw error;
      }

      if (!disposed) setSyncStatus("synced");
    } catch {
      if (!disposed) setSyncStatus("error");
    } finally {
      flushing = false;
      if (dirty && !disposed) schedule();
    }
  };

  const schedule = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  };

  // Pull once — remote wins on sign-in. If the account is empty, push the
  // seed docs so a fresh user still lands on the welcome doc.
  const pull = async () => {
    setSyncStatus("syncing");
    const [{ data: folderRows, error: fErr }, { data: docRows, error: dErr }] =
      await Promise.all([
        sb.from("folders").select("id, name").order("created_at"),
        sb
          .from("docs")
          .select("id, folder_id, title, content, pinned, updated_at")
          .order("updated_at", { ascending: false }),
      ]);
    if (fErr || dErr) {
      setSyncStatus("error");
      return;
    }
    const remoteEmpty =
      (folderRows?.length ?? 0) === 0 && (docRows?.length ?? 0) === 0;
    if (!remoteEmpty) {
      store.setState({
        folders: (folderRows ?? []).map(toFolder),
        docs: (docRows ?? []).map(toDoc),
        activeDocId: docRows?.[0]?.id ?? null,
      });
      setSyncStatus("synced");
    } else {
      // Fresh account: upload the seed workspace as the initial state.
      await flush();
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.docs !== prev.docs || state.folders !== prev.folders) {
      schedule();
    }
  });

  void pull();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
