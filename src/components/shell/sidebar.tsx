import { motion } from "motion/react";
import {
  ChatCircle,
  ClockCounterClockwise,
  DownloadSimple,
  FileText,
  FolderPlus,
  MagnifyingGlass,
  Plus,
  PushPin,
  HardDrives,
  SidebarSimple,
} from "@phosphor-icons/react";
import { useState } from "react";
import { dropDocInto, isDocDrag, useWorkspace } from "@/lib/store";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop, resolveWorkspaceDir } from "@/lib/workspace";
import type { Doc, Folder } from "@/lib/types";
import { TasksNav } from "@/components/tasks/tasks-nav";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AgentsNav } from "@/components/agents/agents-nav";
import { useAgent } from "@/lib/agent-store";
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
  // Subpages are listed under their parent row.
  const ids = new Set(docs.map((d) => d.id));
  const topLevel = (d: Doc) => !d.parentId || !ids.has(d.parentId);
  const rootDocs = docs.filter((d) => d.folderId === null && topLevel(d));

  // Folders first, then root-level docs. Every row gets a running
  // index so the mount stagger cascades through the whole list.
  const tree: TreeEntry[] = [];
  let rowIndex = pinned.length;
  for (const folder of folders) {
    const folderDocs = docs.filter(
      (d) => d.folderId === folder.id && topLevel(d),
    );
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

/** Where the pages live; on desktop a click opens the workspace folder. */
function UserFooter() {
  const count = useWorkspace((s) => s.docs.length);
  const desktop = isDesktop();
  const openFolder = async () => {
    try {
      await invoke("open_folder", { path: await resolveWorkspaceDir() });
    } catch {
      /* folder unavailable */
    }
  };

  return (
    <div className="border-t border-line-soft p-2">
      <button
        type="button"
        disabled={!desktop}
        onClick={() => void openFolder()}
        title={desktop ? "Open the workspace folder" : undefined}
        className="group flex w-full items-center gap-2 rounded-[6px] px-1.5 py-1 text-left transition-colors duration-150 enabled:hover:bg-hover"
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-ink-3">
          <HardDrives size={11} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-ink-2">
            Local workspace
          </span>
          <span className="block truncate text-[10.5px] text-ink-3">
            {count} {count === 1 ? "page" : "pages"} on this device
          </span>
        </span>
      </button>
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
  const [rootOver, setRootOver] = useState(false);
  return (
    <>
      <RecentSection />
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
                  flat
                />
              ))}
            </section>
          )}

          <section>
            <div
              title="Drop a page here to move it out of its folder"
              onDragOver={(e) => {
                if (!isDocDrag(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setRootOver(true);
              }}
              onDragLeave={() => setRootOver(false)}
              onDrop={(e) => {
                if (!isDocDrag(e)) return;
                e.preventDefault();
                setRootOver(false);
                dropDocInto(e, null);
              }}
              className={`group/section flex items-center justify-between rounded-[6px] px-2 pb-1 pt-2 ${
                rootOver ? "bg-accent-dim ring-1 ring-accent-line" : ""
              }`}
            >
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                Documents
              </span>
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/section:opacity-100 group-focus-within/section:opacity-100">
                <button
                  type="button"
                  title="Import notes (Notion, Obsidian, .md)"
                  aria-label="Import notes"
                  onClick={() => useWorkspace.getState().setImportOpen(true)}
                  className="flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
                >
                  <DownloadSimple size={14} />
                </button>
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

const RECENT_ROW =
  "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink";

/** The last two pages and the last two agent chats — one click back in. */
function RecentSection() {
  const docs = useWorkspace((s) => s.docs);
  const activeDocId = useWorkspace((s) => s.activeDocId);
  const railSection = useWorkspace((s) => s.railSection);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const chats = useAgent((s) => s.chats);
  const selectChat = useAgent((s) => s.selectChat);

  const recentDocs = [...docs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);
  const recentChats = chats
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 2);
  if (recentDocs.length + recentChats.length === 0) return null;

  return (
    <section className="mb-2">
      <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <ClockCounterClockwise size={12} />
        Recent
      </div>
      {recentDocs.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => setActiveDoc(d.id)}
          className={`${RECENT_ROW} ${
            railSection === "docs" && activeDocId === d.id ? "bg-elev text-ink" : ""
          }`}
        >
          <FileText size={15} className="shrink-0 text-ink-3" />
          <span className="truncate">{d.title.trim() || "Untitled"}</span>
        </button>
      ))}
      {recentChats.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            selectChat(c.id);
            setRailSection("agents");
          }}
          className={RECENT_ROW}
        >
          <ChatCircle size={15} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate">{c.title.trim() || "New chat"}</span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3">{c.agent}</span>
        </button>
      ))}
    </section>
  );
}
