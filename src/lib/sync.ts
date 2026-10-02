import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { useWorkspace } from "./store";
import { seedDocs, seedFolders } from "./mock-docs";
import { upgradeWelcome } from "./welcome";
import type { Doc, Folder } from "./types";

type DocRow = {
  id: string;
  folder_id: string | null;
  parent_id?: string | null;
  title: string;
  content: string;
  pinned: boolean;
  updated_at: number | string;
};

type FolderRow = {
  id: string;
  name: string;
};

/** Primary key of a deleted row, as realtime reports it. */
type DeletedRow = { id?: string; workspace_id?: string };

const toDoc = (r: DocRow): Doc => ({
  id: r.id,
  folderId: r.folder_id,
  parentId: r.parent_id ?? null,
  title: r.title,
  content: r.content,
  pinned: r.pinned,
  updatedAt: Number(r.updated_at),
});

const toFolder = (r: FolderRow): Folder => ({ id: r.id, name: r.name });

const FLUSH_DEBOUNCE_MS = 900;
/** Re-pull on window focus at most this often (fallback for realtime). */
const REFRESH_MIN_MS = 30_000;

/**
 * Local docs/folders worth carrying into an existing account: anything
 * the remote doesn't know, except seed pages nobody edited.
 */
export function localExtras(
  local: { docs: Doc[]; folders: Folder[] },
  remoteDocs: Doc[],
  remoteFolders: Folder[],
): { extraDocs: Doc[]; extraFolders: Folder[] } {
  const remoteDocIds = new Set(remoteDocs.map((d) => d.id));
  const remoteFolderIds = new Set(remoteFolders.map((f) => f.id));
  const seedById = new Map(seedDocs.map((d) => [d.id, d]));
  const seedFolderIds = new Set(seedFolders.map((f) => f.id));

  // Seed pages carry relative due dates, so compare them date-agnostic.
  const norm = (s: string) => s.replace(/due:\d{4}-\d{2}-\d{2}/g, "due:");
  const extraDocs = local.docs.filter((d) => {
    if (remoteDocIds.has(d.id)) return false;
    const seed = seedById.get(d.id);
    return (
      !seed || norm(seed.content) !== norm(d.content) || seed.title !== d.title
    );
  });
  const needed = new Set(
    extraDocs.map((d) => d.folderId).filter((id): id is string => !!id),
  );
  const extraFolders = local.folders.filter(
    (f) =>
      !remoteFolderIds.has(f.id) &&
      (needed.has(f.id) || !seedFolderIds.has(f.id)),
  );
  // Docs whose folder is neither remote nor carried over land at the root.
  const known = new Set([
    ...remoteFolderIds,
    ...extraFolders.map((f) => f.id),
  ]);
  return {
    extraDocs: extraDocs.map((d) =>
      d.folderId && !known.has(d.folderId) ? { ...d, folderId: null } : d,
    ),
    extraFolders,
  };
}

/** Pushes whatever is pending right now; resolves when the server has it. */
let flushActive: (() => Promise<void>) | null = null;

/**
 * Flushes pending workspace changes immediately — call before signing
 * out, otherwise edits still inside the debounce window are dropped.
 */
export async function flushWorkspaceSync(): Promise<void> {
  await flushActive?.();
}

/**
 * Bidirectional sync of one workspace for a signed-in user. Rows are
 * keyed by (workspace_id, id), so page ids only need to be unique
 * inside the workspace (the seed pages share ids across accounts).
 *
 *  - Pulls once on start (retried until it succeeds). Nothing is pushed
 *    before that pull landed — a failed pull used to be followed by a
 *    push that deleted every remote page missing locally.
 *  - Pushes only rows that changed since the last push, and deletes only
 *    rows that were removed locally (tracked explicitly, never inferred
 *    from "missing locally").
 *  - Merges remote changes live (Supabase Realtime) and on window focus,
 *    newer `updatedAt` wins.
 *
 * Returns a dispose function — call it when the session ends.
 */
export function initSync(workspaceId: string): () => void {
  const sb = getSupabase();
  const store = useWorkspace;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let dirty = false;
  let disposed = false;
  let pulled = false;
  let pullFailures = 0;
  let lastRefresh = 0;
  let channel: RealtimeChannel | null = null;
  /** Bumped on every push and realtime event — a snapshot fetched across
   *  one of those is stale and must not be used to infer deletions. */
  let remoteGen = 0;

  /** Row objects that match what the server has (docs are immutable). */
  const pushedDocs = new WeakSet<Doc>();
  const pushedFolders = new WeakSet<Folder>();
  /** Ids the server is known to have — a vanished one was deleted remotely. */
  const remoteDocIds = new Set<string>();
  /** Removed locally, not yet deleted on the server. */
  const deletedDocs = new Set<string>();
  const deletedFolders = new Set<string>();
  /** Set while remote state is applied, so it isn't echoed back. */
  let applyingRemote = false;

  const setSyncStatus = (s: "idle" | "syncing" | "synced" | "error") => {
    if (!disposed) store.setState({ syncStatus: s });
  };

  const applyRemote = (
    patch: Partial<ReturnType<typeof store.getState>>,
  ) => {
    applyingRemote = true;
    try {
      store.setState(patch);
    } finally {
      applyingRemote = false;
    }
  };

  const pushOnce = async () => {
    const { docs, folders } = store.getState();
    const folderRows = folders.filter((f) => !pushedFolders.has(f));
    const docRows = docs.filter((d) => !pushedDocs.has(d));
    const docDeletes = [...deletedDocs];
    const folderDeletes = [...deletedFolders];
    if (
      folderRows.length + docRows.length + docDeletes.length + folderDeletes.length ===
      0
    ) {
      return;
    }
    setSyncStatus("syncing");
    // Folders first (docs reference them), folder deletes last.
    if (folderRows.length > 0) {
      const { error } = await sb.from("folders").upsert(
        folderRows.map((f) => ({
          id: f.id,
          workspace_id: workspaceId,
          name: f.name,
        })),
        { onConflict: "workspace_id,id" },
      );
      if (error) throw error;
      folderRows.forEach((f) => pushedFolders.add(f));
    }
    if (docRows.length > 0) {
      const { error } = await sb.from("docs").upsert(
        // user_id is left to its default (the creator) — an update by
        // another member must not rewrite it.
        docRows.map((d) => ({
          id: d.id,
          workspace_id: workspaceId,
          folder_id: d.folderId,
          parent_id: d.parentId ?? null,
          title: d.title,
          content: d.content,
          pinned: d.pinned,
          updated_at: d.updatedAt,
        })),
        { onConflict: "workspace_id,id" },
      );
      if (error) throw error;
      remoteGen += 1;
      docRows.forEach((d) => {
        pushedDocs.add(d);
        remoteDocIds.add(d.id);
      });
    }
    if (docDeletes.length > 0) {
      const { error } = await sb
        .from("docs")
        .delete()
        .eq("workspace_id", workspaceId)
        .in("id", docDeletes);
      if (error) throw error;
      docDeletes.forEach((id) => {
        deletedDocs.delete(id);
        remoteDocIds.delete(id);
      });
    }
    if (folderDeletes.length > 0) {
      const { error } = await sb
        .from("folders")
        .delete()
        .eq("workspace_id", workspaceId)
        .in("id", folderDeletes);
      if (error) throw error;
      folderDeletes.forEach((id) => deletedFolders.delete(id));
    }
  };

  const flush = (): Promise<void> => {
    if (!pulled || disposed) return Promise.resolve();
    if (inflight) {
      dirty = true;
      return inflight;
    }
    dirty = false;
    inflight = (async () => {
      try {
        await pushOnce();
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
        // Try again later — pending rows stay pending.
        if (!disposed) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void flush(), 5000);
        }
      } finally {
        inflight = null;
      }
      if (dirty && !disposed) await flush();
    })();
    return inflight;
  };

  const schedule = () => {
    if (disposed || !pulled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), FLUSH_DEBOUNCE_MS);
  };

  flushActive = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await flush();
  };

  /** Merges a remote snapshot (or a single realtime row) into the store. */
  const mergeRemote = (
    rDocs: Doc[],
    rFolders: Folder[] | null,
    complete: boolean,
  ) => {
    const st = store.getState();
    const localById = new Map(st.docs.map((d) => [d.id, d]));
    const incoming = new Map(rDocs.map((d) => [d.id, d]));
    let changed = false;

    let docs = st.docs.map((l) => {
      const r = incoming.get(l.id);
      if (r && r.updatedAt > l.updatedAt) {
        pushedDocs.add(r);
        changed = true;
        return r;
      }
      return l;
    });
    const added = rDocs.filter(
      (r) => !localById.has(r.id) && !deletedDocs.has(r.id),
    );
    if (added.length > 0) {
      added.forEach((r) => pushedDocs.add(r));
      docs = [...added, ...docs];
      changed = true;
    }
    rDocs.forEach((r) => remoteDocIds.add(r.id));
    if (complete) {
      // Gone remotely and unchanged here → deleted on another device.
      const before = docs.length;
      docs = docs.filter(
        (l) =>
          incoming.has(l.id) || !remoteDocIds.has(l.id) || !pushedDocs.has(l),
      );
      if (docs.length !== before) changed = true;
      for (const id of [...remoteDocIds]) {
        if (!incoming.has(id)) remoteDocIds.delete(id);
      }
    }

    let folders = st.folders;
    if (rFolders) {
      const localF = new Map(folders.map((f) => [f.id, f]));
      const rIds = new Set(rFolders.map((f) => f.id));
      folders = folders.map((f) => {
        const r = rFolders.find((x) => x.id === f.id);
        // Folders carry no timestamp: a remote rename wins unless the
        // folder was renamed here and not pushed yet.
        if (r && r.name !== f.name && pushedFolders.has(f)) {
          pushedFolders.add(r);
          changed = true;
          return r;
        }
        return f;
      });
      const newFolders = rFolders.filter(
        (r) => !localF.has(r.id) && !deletedFolders.has(r.id),
      );
      if (newFolders.length > 0) {
        newFolders.forEach((f) => pushedFolders.add(f));
        folders = [...folders, ...newFolders];
        changed = true;
      }
      if (complete) {
        const before = folders.length;
        folders = folders.filter((f) => rIds.has(f.id) || !pushedFolders.has(f));
        if (folders.length !== before) changed = true;
      }
    }
    if (changed) {
      const ids = new Set(folders.map((f) => f.id));
      applyRemote({
        folders,
        docs: docs.map((d) =>
          d.folderId && !ids.has(d.folderId) ? { ...d, folderId: null } : d,
        ),
      });
    }
  };

  const fetchRemote = async () => {
    const [{ data: folderRows, error: fErr }, { data: docRows, error: dErr }] =
      await Promise.all([
        sb
          .from("folders")
          .select("id, name")
          .eq("workspace_id", workspaceId)
          .order("created_at"),
        sb
          .from("docs")
          .select("id, folder_id, parent_id, title, content, pinned, updated_at")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false }),
      ]);
    if (fErr || dErr) throw fErr ?? dErr;
    return {
      docs: ((docRows ?? []) as DocRow[]).map(toDoc),
      folders: ((folderRows ?? []) as FolderRow[]).map(toFolder),
    };
  };

  // First pull — remote wins on sign-in. The store starts empty for an
  // account (the device's own pages stay in the local workspace; the
  // merge dialog offers to bring them over), so the only local pages
  // here are ones made while the pull was in flight — they're kept. An
  // empty workspace (new account) starts from the seed pages.
  const pull = async () => {
    setSyncStatus("syncing");
    let remote: { docs: Doc[]; folders: Folder[] };
    try {
      remote = await fetchRemote();
    } catch {
      if (disposed) return;
      setSyncStatus("error");
      // Keep retrying; never push before a pull succeeded.
      pullFailures += 1;
      retryTimer = setTimeout(
        () => void pull(),
        Math.min(60_000, 3000 * 2 ** Math.min(pullFailures, 5)),
      );
      return;
    }
    if (disposed) return;
    const remoteEmpty = remote.docs.length === 0 && remote.folders.length === 0;
    if (remoteEmpty) {
      const st = store.getState();
      const docs = [
        ...st.docs,
        ...seedDocs
          .filter((d) => !st.docs.some((l) => l.id === d.id))
          .map((d) => ({ ...d, updatedAt: Date.now() })),
      ];
      applyRemote({
        folders: [
          ...st.folders,
          ...seedFolders.filter((f) => !st.folders.some((l) => l.id === f.id)),
        ],
        docs,
        activeDocId: st.activeDocId ?? docs[0]?.id ?? null,
      });
    } else {
      remote.docs.forEach((d) => {
        pushedDocs.add(d);
        remoteDocIds.add(d.id);
      });
      remote.folders.forEach((f) => pushedFolders.add(f));
      const { extraDocs, extraFolders } = localExtras(
        store.getState(),
        remote.docs,
        remote.folders,
      );
      // New welcome version for accounts that still have an older one.
      const docs = upgradeWelcome([...extraDocs, ...remote.docs], (gone) =>
        deletedDocs.add(gone),
      );
      const active = store.getState().activeDocId;
      applyRemote({
        folders: [...remote.folders, ...extraFolders],
        docs,
        activeDocId: docs.some((d) => d.id === active)
          ? active
          : (docs[0]?.id ?? null),
      });
    }
    pulled = true;
    lastRefresh = Date.now();
    await flush();
    setSyncStatus("synced");
  };

  const refresh = async () => {
    if (!pulled || disposed) return;
    if (Date.now() - lastRefresh < REFRESH_MIN_MS) return;
    lastRefresh = Date.now();
    try {
      const gen = remoteGen;
      const remote = await fetchRemote();
      if (!disposed) {
        mergeRemote(remote.docs, remote.folders, gen === remoteGen && !inflight);
      }
    } catch {
      /* offline — the next focus retries */
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.docs === prev.docs && state.folders === prev.folders) return;
    if (!applyingRemote) {
      if (state.docs !== prev.docs) {
        const now = new Set(state.docs.map((d) => d.id));
        for (const d of prev.docs) {
          if (!now.has(d.id)) deletedDocs.add(d.id);
        }
        // Re-created (undo) before the delete went out.
        for (const id of now) deletedDocs.delete(id);
      }
      if (state.folders !== prev.folders) {
        const now = new Set(state.folders.map((f) => f.id));
        for (const f of prev.folders) {
          if (!now.has(f.id)) deletedFolders.add(f.id);
        }
        for (const id of now) deletedFolders.delete(id);
      }
    }
    schedule();
  });

  // Live updates from other devices and members. Needs the realtime
  // publication (migration 20260927_realtime.sql); without it the focus
  // refresh below still catches up. Deletes can't be filtered on the
  // server — the old row carries its key (workspace_id, id), so deletes
  // from other workspaces are dropped here.
  const inThisWorkspace = (old: DeletedRow) =>
    !old.workspace_id || old.workspace_id === workspaceId;
  const onDocDelete = (id: string | undefined) => {
    const local = store.getState().docs.find((d) => d.id === id);
    // Keep it if it was edited here since — it gets re-uploaded.
    if (local && pushedDocs.has(local)) {
      remoteDocIds.delete(local.id);
      applyRemote({ docs: store.getState().docs.filter((d) => d.id !== id) });
    }
  };
  const onFolderDelete = (id: string | undefined) => {
    const st = store.getState();
    const local = st.folders.find((f) => f.id === id);
    if (local && pushedFolders.has(local)) {
      applyRemote({
        folders: st.folders.filter((f) => f.id !== id),
        docs: st.docs.map((d) =>
          d.folderId === id ? { ...d, folderId: null } : d,
        ),
      });
    }
  };
  try {
    const mine = `workspace_id=eq.${workspaceId}`;
    channel = sb.channel(`workspace-${workspaceId}`);
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel
        .on(
          "postgres_changes",
          { event, schema: "public", table: "docs", filter: mine },
          (p) => {
            if (!pulled) return;
            remoteGen += 1;
            mergeRemote([toDoc(p.new as DocRow)], null, false);
          },
        )
        .on(
          "postgres_changes",
          { event, schema: "public", table: "folders", filter: mine },
          (p) => {
            if (!pulled) return;
            remoteGen += 1;
            mergeRemote([], [toFolder(p.new as FolderRow)], false);
          },
        );
    }
    channel
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "docs" },
        (p) => {
          const old = p.old as DeletedRow;
          if (!pulled || !inThisWorkspace(old)) return;
          remoteGen += 1;
          onDocDelete(old.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "folders" },
        (p) => {
          const old = p.old as DeletedRow;
          if (!pulled || !inThisWorkspace(old)) return;
          remoteGen += 1;
          onFolderDelete(old.id);
        },
      )
      .subscribe();
  } catch {
    channel = null;
  }

  const onFocus = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  const onOnline = () => {
    if (!pulled) {
      if (retryTimer) clearTimeout(retryTimer);
      void pull();
    } else {
      void flush();
    }
  };
  document.addEventListener("visibilitychange", onFocus);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  void pull();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (retryTimer) clearTimeout(retryTimer);
    unsubscribe();
    document.removeEventListener("visibilitychange", onFocus);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    if (channel) void sb.removeChannel(channel);
    flushActive = null;
  };
}
