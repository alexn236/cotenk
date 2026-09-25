import { create } from "zustand";
import type { Doc, Folder, RailSection } from "./types";
import { seedDocs, seedFolders } from "./mock-docs";
import { toast } from "./toast";

let counter = 100;
const uid = () => `id-${(counter++).toString(36)}-${Date.now().toString(36)}`;

type Theme = "dark" | "light";
export type SyncStatus = "idle" | "syncing" | "synced" | "error";
export type TaskFilter = "all" | "open" | "done";
export type TaskGroup = "page" | "due";
export type MarketTab = "discover" | "mine" | "build";
export type SettingsSection =
  | "appearance"
  | "account"
  | "sync"
  | "agents"
  | "about";

type WorkspaceState = {
  docs: Doc[];
  folders: Folder[];
  activeDocId: string | null;
  railSection: RailSection;
  sidebarCollapsed: boolean;
  contentsOpen: boolean;
  theme: Theme;
  taskFilter: TaskFilter;
  taskGroup: TaskGroup;
  /** Only show tasks assigned to this @name (lowercase). */
  taskAssignee: string | null;
  settingsSection: SettingsSection;
  syncStatus: SyncStatus;
  paletteOpen: boolean;
  marketTab: MarketTab;
  /** Doc whose "Publish to marketplace" dialog is open. */
  publishDocId: string | null;
  /** Folder whose name is being edited inline in the sidebar. */
  renamingFolderId: string | null;

  setActiveDoc: (id: string) => void;
  setRailSection: (s: RailSection) => void;
  createDoc: (folderId?: string | null) => string;
  /** Creates a doc with initial title/content (templates, AI output). */
  createDocWith: (init: {
    title: string;
    content: string;
    folderId?: string | null;
  }) => string;
  duplicateDoc: (id: string) => string | null;
  /** Re-inserts a previously deleted doc (undo). */
  restoreDoc: (doc: Doc, index: number) => void;
  moveDoc: (id: string, folderId: string | null) => void;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  /** Removes the folder; its docs move to the workspace root. */
  deleteFolder: (id: string) => void;
  renameDoc: (id: string, title: string) => void;
  updateDocContent: (id: string, content: string) => void;
  deleteDoc: (id: string) => void;
  togglePin: (id: string) => void;
  toggleSidebar: () => void;
  toggleContents: () => void;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setTaskFilter: (f: TaskFilter) => void;
  setTaskGroup: (g: TaskGroup) => void;
  setTaskAssignee: (a: string | null) => void;
  setSettingsSection: (s: SettingsSection) => void;
  setPaletteOpen: (open: boolean) => void;
  setMarketTab: (t: MarketTab) => void;
  setPublishDocId: (id: string | null) => void;
  setRenamingFolderId: (id: string | null) => void;
};

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  docs: seedDocs,
  folders: seedFolders,
  activeDocId: seedDocs[0]?.id ?? null,
  railSection: "docs",
  sidebarCollapsed: false,
  contentsOpen: true,
  // Hydrate from the data-theme the pre-paint script already set.
  theme:
    (typeof document !== "undefined" &&
    (document.documentElement.dataset.theme === "light" ||
      document.documentElement.dataset.theme === "dark")
      ? document.documentElement.dataset.theme
      : "dark") as Theme,
  taskFilter: "open" as TaskFilter,
  taskGroup: "page" as TaskGroup,
  taskAssignee: null,
  settingsSection: "appearance" as SettingsSection,
  syncStatus: "idle" as SyncStatus,
  paletteOpen: false,
  marketTab: "discover" as MarketTab,
  publishDocId: null,
  renamingFolderId: null,

  setActiveDoc: (id) => set({ activeDocId: id, railSection: "docs" }),
  // A rail click while the sidebar is collapsed expands it again.
  setRailSection: (s) => set({ railSection: s, sidebarCollapsed: false }),

  createDoc: (folderId = null) => {
    const id = uid();
    const doc: Doc = {
      id,
      folderId,
      // Empty title → the editor shows the "Untitled" placeholder and
      // focuses the title so typing starts right away.
      title: "",
      content: "",
      pinned: false,
      updatedAt: Date.now(),
    };
    set((s) => ({ docs: [doc, ...s.docs], activeDocId: id }));
    return id;
  },

  createDocWith: ({ title, content, folderId = null }) => {
    const id = uid();
    const doc: Doc = {
      id,
      folderId,
      title,
      content,
      pinned: false,
      updatedAt: Date.now(),
    };
    set((s) => ({
      docs: [doc, ...s.docs],
      activeDocId: id,
      railSection: "docs",
    }));
    return id;
  },

  duplicateDoc: (id) => {
    const src = get().docs.find((d) => d.id === id);
    if (!src) return null;
    const copy: Doc = {
      ...src,
      id: uid(),
      title: `${src.title.trim() || "Untitled"} (copy)`,
      pinned: false,
      updatedAt: Date.now(),
    };
    set((s) => {
      const i = s.docs.findIndex((d) => d.id === id);
      const docs = [...s.docs];
      docs.splice(i + 1, 0, copy);
      return { docs, activeDocId: copy.id, railSection: "docs" };
    });
    return copy.id;
  },

  restoreDoc: (doc, index) =>
    set((s) => {
      if (s.docs.some((d) => d.id === doc.id)) return {};
      const docs = [...s.docs];
      docs.splice(Math.min(index, docs.length), 0, {
        ...doc,
        // Folder may have been deleted in the meantime.
        folderId: s.folders.some((f) => f.id === doc.folderId)
          ? doc.folderId
          : null,
        updatedAt: Date.now(),
      });
      return { docs, activeDocId: doc.id };
    }),

  moveDoc: (id, folderId) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, folderId, updatedAt: Date.now() } : d,
      ),
    })),

  createFolder: (name) => {
    const id = uid();
    set((s) => ({ folders: [...s.folders, { id, name }], renamingFolderId: id }));
    return id;
  },

  renameFolder: (id, name) =>
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
      // Bump the docs inside so the file mirror moves them to the new dir.
      docs: s.docs.map((d) =>
        d.folderId === id ? { ...d, updatedAt: Date.now() } : d,
      ),
    })),

  deleteFolder: (id) =>
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      docs: s.docs.map((d) =>
        d.folderId === id ? { ...d, folderId: null, updatedAt: Date.now() } : d,
      ),
    })),

  renameDoc: (id, title) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, title, updatedAt: Date.now() } : d,
      ),
    })),

  updateDocContent: (id, content) =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, content, updatedAt: Date.now() } : d,
      ),
    })),

  deleteDoc: (id) =>
    set((s) => {
      const docs = s.docs.filter((d) => d.id !== id);
      return {
        docs,
        activeDocId:
          s.activeDocId === id ? (docs[0]?.id ?? null) : s.activeDocId,
      };
    }),

  togglePin: (id) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, pinned: !d.pinned } : d)),
    })),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleContents: () => set((s) => ({ contentsOpen: !s.contentsOpen })),

  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = theme;
      }
      try {
        localStorage.setItem("cotenk-theme", theme);
      } catch {
        /* storage unavailable */
      }
      return { theme };
    }),

  setTheme: (theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
    try {
      localStorage.setItem("cotenk-theme", theme);
    } catch {
      /* storage unavailable */
    }
    set({ theme });
  },

  setTaskFilter: (f) => set({ taskFilter: f }),
  setTaskGroup: (g) => set({ taskGroup: g }),
  setTaskAssignee: (a) => set({ taskAssignee: a }),
  setSettingsSection: (s) => set({ settingsSection: s }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setMarketTab: (t) => set({ marketTab: t }),
  setPublishDocId: (id) => set({ publishDocId: id }),
  setRenamingFolderId: (id) => set({ renamingFolderId: id }),
}));

export const useActiveDoc = () =>
  useWorkspace((s) => s.docs.find((d) => d.id === s.activeDocId) ?? null);

/** Deletes a doc and offers an undo toast. */
export function trashDoc(id: string) {
  const st = useWorkspace.getState();
  const index = st.docs.findIndex((d) => d.id === id);
  const doc = st.docs[index];
  if (!doc) return;
  st.deleteDoc(id);
  toast(`Deleted “${doc.title.trim() || "Untitled"}”`, {
    action: {
      label: "Undo",
      run: () => useWorkspace.getState().restoreDoc(doc, index),
    },
  });
}

/** Deletes a folder (docs move to root) and offers an undo toast. */
export function trashFolder(id: string) {
  const st = useWorkspace.getState();
  const folder = st.folders.find((f) => f.id === id);
  if (!folder) return;
  const index = st.folders.indexOf(folder);
  const docIds = st.docs.filter((d) => d.folderId === id).map((d) => d.id);
  st.deleteFolder(id);
  toast(`Deleted folder “${folder.name}”`, {
    action: {
      label: "Undo",
      run: () =>
        useWorkspace.setState((s) => {
          const folders = [...s.folders];
          folders.splice(index, 0, folder);
          return {
            folders,
            docs: s.docs.map((d) =>
              docIds.includes(d.id)
                ? { ...d, folderId: id, updatedAt: Date.now() }
                : d,
            ),
          };
        }),
    },
  });
}
