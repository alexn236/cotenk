import { create } from "zustand";
import type { Doc, Folder, RailSection } from "./types";
import { seedDocs, seedFolders } from "./mock-docs";
import { loadLocalWorkspace } from "./local-workspace";
import { upgradeWelcome, WELCOME_ID } from "./welcome";
import { toast } from "./toast";
import { newId } from "./ids";
import { onboardingPending } from "./onboarding";
import { renameWikilinks, titleKey } from "./wikilinks";

const uid = () => newId();

/** Ids of every page nested (at any depth) under `id`. */
export function descendantIds(docs: Doc[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (pid: string) => {
    for (const d of docs) {
      if (d.parentId === pid && !out.has(d.id)) {
        out.add(d.id);
        walk(d.id);
      }
    }
  };
  walk(id);
  return out;
}

type Theme = "dark" | "light";
export type SyncStatus = "idle" | "syncing" | "synced" | "error";
export type TaskFilter = "all" | "open" | "done";
export type TaskGroup = "page" | "due";
export type TaskView = "list" | "board";
export type MarketTab = "discover" | "mine" | "build";
export type SettingsSection =
  | "appearance"
  | "account"
  | "sync"
  | "agents"
  | "extensions"
  | "data"
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
  taskView: TaskView;
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
  /** Import dialog (Notion / Obsidian / markdown). */
  importOpen: boolean;
  /** Doc whose version history is open (or "trash" for deleted pages). */
  historyDocId: string | null;
  /** Doc whose "Ask agent" popover should open (onboarding, setup). */
  askAgentDocId: string | null;

  setActiveDoc: (id: string) => void;
  setRailSection: (s: RailSection) => void;
  createDoc: (folderId?: string | null) => string;
  /** Creates a doc with initial title/content (templates, AI output). */
  createDocWith: (init: {
    title: string;
    content: string;
    folderId?: string | null;
  }) => string;
  /** Creates an empty page nested under `parentId`. */
  createSubpage: (parentId: string) => string;
  /** Nests a page under another (null = top level). Ignores cycles. */
  setParent: (id: string, parentId: string | null) => void;
  /** After a rename: points [[from]] links in other pages at `to`. */
  relinkTitle: (docId: string, from: string, to: string) => void;
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
  setTaskView: (v: TaskView) => void;
  setTaskAssignee: (a: string | null) => void;
  setSettingsSection: (s: SettingsSection) => void;
  setPaletteOpen: (open: boolean) => void;
  setMarketTab: (t: MarketTab) => void;
  setPublishDocId: (id: string | null) => void;
  setRenamingFolderId: (id: string | null) => void;
  setImportOpen: (open: boolean) => void;
  /** Opens "Ask agent" on this doc once the editor shows it. */
  requestAskAgent: (docId: string | null) => void;
  setHistoryDocId: (id: string | null) => void;
};

// A signed-out session that already has pages resumes them; everyone
// else starts on the seed workspace (welcome page first).
const local = typeof window !== "undefined" ? loadLocalWorkspace() : null;
const initialDocs = local ? upgradeWelcome(local.docs) : seedDocs;
const initialFolders = local?.folders ?? seedFolders;

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  docs: initialDocs,
  folders: initialFolders,
  activeDocId:
    initialDocs.find((d) => d.id === WELCOME_ID)?.id ??
    initialDocs[0]?.id ??
    null,
  // New here: open on Home, where the getting-started checklist lives.
  railSection: onboardingPending() ? "home" : "docs",
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
  taskView: "list" as TaskView,
  taskAssignee: null,
  settingsSection: "appearance" as SettingsSection,
  syncStatus: "idle" as SyncStatus,
  paletteOpen: false,
  marketTab: "discover" as MarketTab,
  publishDocId: null,
  renamingFolderId: null,
  importOpen: false,
  askAgentDocId: null,
  historyDocId: null,

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

  createSubpage: (parentId) => {
    const parent = get().docs.find((d) => d.id === parentId);
    if (!parent) return get().createDoc();
    const id = uid();
    const doc: Doc = {
      id,
      folderId: parent.folderId,
      parentId,
      title: "",
      content: "",
      pinned: false,
      updatedAt: Date.now(),
    };
    set((s) => ({ docs: [doc, ...s.docs], activeDocId: id, railSection: "docs" }));
    return id;
  },

  setParent: (id, parentId) =>
    set((s) => {
      const doc = s.docs.find((d) => d.id === id);
      const parent = parentId ? s.docs.find((d) => d.id === parentId) : null;
      if (!doc || (parentId && !parent) || doc.parentId === (parentId ?? null)) {
        return {};
      }
      if (parentId && (parentId === id || descendantIds(s.docs, id).has(parentId))) {
        return {};
      }
      const now = Date.now();
      return {
        docs: s.docs.map((d) =>
          d.id === id
            ? {
                ...d,
                parentId,
                folderId: parent ? parent.folderId : d.folderId,
                updatedAt: now,
              }
            : d,
        ),
      };
    }),

  relinkTitle: (docId, from, to) => {
    if (!from.trim() || !to.trim() || titleKey(from) === titleKey(to)) return;
    const st = get();
    // Another page still has the old title — links may mean that one.
    if (st.docs.some((d) => d.id !== docId && titleKey(d.title) === titleKey(from))) {
      return;
    }
    const now = Date.now();
    let changed = false;
    const docs = st.docs.map((d) => {
      const next = renameWikilinks(d.content, from, to);
      if (next === d.content) return d;
      changed = true;
      return { ...d, content: next, updatedAt: now };
    });
    if (changed) set({ docs });
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
        parentId: s.docs.some((d) => d.id === doc.parentId)
          ? doc.parentId
          : null,
        updatedAt: Date.now(),
      });
      return { docs, activeDocId: doc.id };
    }),

  // Subpages travel with their parent.
  moveDoc: (id, folderId) =>
    set((s) => {
      const moving = descendantIds(s.docs, id).add(id);
      return {
        docs: s.docs.map((d) =>
          moving.has(d.id)
            ? {
                ...d,
                folderId,
                parentId: d.id === id ? null : d.parentId,
                updatedAt: Date.now(),
              }
            : d,
        ),
      };
    }),

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
      const gone = s.docs.find((d) => d.id === id);
      const now = Date.now();
      // Subpages move up one level instead of disappearing.
      const docs = s.docs
        .filter((d) => d.id !== id)
        .map((d) =>
          d.parentId === id
            ? { ...d, parentId: gone?.parentId ?? null, updatedAt: now }
            : d,
        );
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
  setTaskView: (v) => set({ taskView: v }),
  setTaskAssignee: (a) => set({ taskAssignee: a }),
  setSettingsSection: (s) => set({ settingsSection: s }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setMarketTab: (t) => set({ marketTab: t }),
  setPublishDocId: (id) => set({ publishDocId: id }),
  setRenamingFolderId: (id) => set({ renamingFolderId: id }),
  setImportOpen: (open) => set({ importOpen: open }),
  requestAskAgent: (docId) => set({ askAgentDocId: docId }),
  setHistoryDocId: (id) => set({ historyDocId: id }),
}));

export const useActiveDoc = () =>
  useWorkspace((s) => s.docs.find((d) => d.id === s.activeDocId) ?? null);

/**
 * Opens the welcome page; re-creates it from the seed if it was deleted,
 * so the tour is always one command away.
 */
export function openWelcomePage() {
  const st = useWorkspace.getState();
  const seed = seedDocs.find((d) => d.id === WELCOME_ID);
  if (!seed) return;
  if (!st.docs.some((d) => d.id === seed.id)) {
    useWorkspace.setState((s) => ({
      docs: [{ ...seed, updatedAt: Date.now() }, ...s.docs],
    }));
  }
  st.setActiveDoc(seed.id);
}

/** DataTransfer type for dragging pages inside the sidebar. */
export const DOC_DRAG_TYPE = "application/x-cotenk-doc";

export const isDocDrag = (e: { dataTransfer: DataTransfer }) =>
  Array.from(e.dataTransfer.types).includes(DOC_DRAG_TYPE);

/** Moves a dragged page into `folderId` (null = workspace root). */
export function dropDocInto(e: { dataTransfer: DataTransfer }, folderId: string | null) {
  const id = e.dataTransfer.getData(DOC_DRAG_TYPE);
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === id);
  if (!doc || doc.folderId === folderId) return;
  st.moveDoc(id, folderId);
  const name = folderId
    ? st.folders.find((f) => f.id === folderId)?.name ?? "folder"
    : "Documents";
  toast(`Moved “${doc.title.trim() || "Untitled"}” to ${name}`);
}

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
