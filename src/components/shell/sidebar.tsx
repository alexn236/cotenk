import { motion } from "motion/react";
import {
  FolderPlus,
  MagnifyingGlass,
  Plus,
  PushPin,
  SidebarSimple,
  SignOut,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import type { Doc, Folder } from "@/lib/types";
import { TasksNav } from "@/components/tasks/tasks-nav";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AgentsNav } from "@/components/agents/agents-nav";
import { MarketNav } from "@/components/market/market-nav";
import { DocRow } from "./doc-row";
import { FolderSection } from "./folder-section";

const SIDEBAR_WIDTH = 248;

type TreeEntry =
  | { kind: "folder"; id: string; folder: Folder; docs: Doc[]; index: number }
  | { kind: "doc"; id: string; doc: Doc; index: number };

export function Sidebar() {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  const collapsed = useWorkspace((s) => s.sidebarCollapsed);
  const railSection = useWorkspace((s) => s.railSection);
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar);
  const createDoc = useWorkspace((s) => s.createDoc);
  const createFolder = useWorkspace((s) => s.createFolder);
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen);

  const pinned = docs.filter((d) => d.pinned);
  const rootDocs = docs.filter((d) => d.folderId === null);

  // Folders first, then root-level docs. Every row gets a running
  // index so the mount stagger cascades through the whole list.
  const tree: TreeEntry[] = [];
  let rowIndex = pinned.length;
  for (const folder of folders) {
    const folderDocs = docs.filter((d) => d.folderId === folder.id);
    tree.push({
      kind: "folder",
      id: folder.id,
      folder,
      docs: folderDocs,
      index: rowIndex,
    });
    rowIndex += 1 + folderDocs.length;
  }
  for (const doc of rootDocs) {
    tree.push({ kind: "doc", id: doc.id, doc, index: rowIndex });
    rowIndex += 1;
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : SIDEBAR_WIDTH }}
      transition={{ type: "spring", stiffness: 400, damping: 40 }}
      className="h-dvh shrink-0 overflow-hidden"
    >
      <div className="flex h-dvh w-[248px] flex-col border-r border-line-soft bg-panel">
        {/* header */}
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-[13px] font-semibold text-ink">CoTenk</span>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar (Ctrl+\)"
            title="Collapse sidebar (Ctrl+\)"
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
          >
            <SidebarSimple size={16} />
          </button>
        </div>

        {/* search */}
        <div className="mt-2 px-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-7 w-full items-center gap-2 rounded-[6px] border border-line-soft bg-panel-2 px-2 text-left text-[12.5px] text-ink-3 transition-colors duration-150 hover:bg-elev"
          >
            <MagnifyingGlass size={13} className="shrink-0" />
            <span className="flex-1">Search or ask…</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        {/* nav — content depends on the active rail section */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {railSection === "tasks" ? (
            <TasksNav />
          ) : railSection === "settings" ? (
            <SettingsNav />
          ) : railSection === "agents" ? (
            <AgentsNav />
          ) : railSection === "market" ? (
            <MarketNav />
          ) : (
            <DocsNav
              pinned={pinned}
              tree={tree}
              createDoc={createDoc}
              createFolder={createFolder}
            />
          )}
        </div>

        {/* footer */}
        <UserFooter />
      </div>
    </motion.aside>
  );
}

function UserFooter() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const syncStatus = useWorkspace((s) => s.syncStatus);

  const email = user?.email ?? "local";
  const initial = (email[0] ?? "?").toUpperCase();
  const statusDot =
    syncStatus === "synced"
      ? "bg-emerald-500/70"
      : syncStatus === "syncing"
        ? "animate-pulse bg-accent"
        : syncStatus === "error"
          ? "bg-danger"
          : "bg-ink-3";
  const statusLabel =
    syncStatus === "synced"
      ? "Synced"
      : syncStatus === "syncing"
        ? "Syncing"
        : syncStatus === "error"
          ? "Sync error"
          : "Local";

  return (
    <div className="border-t border-line-soft p-2">
      <div className="flex items-center gap-2 px-1">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-elev">
          <span className="text-[9px] leading-none text-ink-3">{initial}</span>
        </div>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
          {email}
        </span>
        <span
          title={statusLabel}
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`}
        />
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
        >
          <SignOut size={13} />
        </button>
      </div>
    </div>
  );
}

function DocsNav({
  pinned,
  tree,
  createDoc,
  createFolder,
}: {
  pinned: Doc[];
  tree: TreeEntry[];
  createDoc: (folderId?: string | null) => string;
  createFolder: (name: string) => string;
}) {
  return (
    <>
      {pinned.length > 0 && (
            <section className="mb-1">
              <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                <PushPin size={12} />
                Pinned
              </div>
              {pinned.map((doc, i) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  index={i}
                  indicatorId="doc-active-pinned"
                />
              ))}
            </section>
          )}

          <section>
            <div className="group/section flex items-center justify-between px-2 pb-1 pt-2">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                Documents
              </span>
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/section:opacity-100 group-focus-within/section:opacity-100">
                <button
                  type="button"
                  title="New folder"
                  aria-label="New folder"
                  onClick={() => createFolder("New folder")}
                  className="flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  type="button"
                  title="New page"
                  aria-label="New page"
                  onClick={() => createDoc()}
                  className="flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {tree.map((entry) =>
              entry.kind === "folder" ? (
                <FolderSection
                  key={entry.id}
                  folder={entry.folder}
                  docs={entry.docs}
                  index={entry.index}
                />
              ) : (
                <DocRow key={entry.id} doc={entry.doc} index={entry.index} />
              ),
            )}

            <button
              type="button"
              onClick={() => createDoc()}
              className="mt-0.5 flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
            >
              <Plus size={15} />
              New page
            </button>
          </section>
    </>
  );
}
