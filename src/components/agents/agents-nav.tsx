import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AGENTS } from "@/lib/agents";
import {
  CaretRight,
  ChatCircle,
  Check,
  DotsThree,
  FolderPlus,
  Folder,
  PencilSimple,
  Plus,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react";
import {
  useAgent,
  type AgentChat,
  type AgentProject,
} from "@/lib/agent-store";

const MENU_W = 168;

type MenuPos = { left: number; top: number; flip: boolean };

/** Sidebar section for the Agents rail: pinned chats, project groups
 *  with nested chats, and unfiled chats — all saved on this device. */
export function AgentsNav() {
  const chats = useAgent((s) => s.chats);
  const projects = useAgent((s) => s.projects);
  const newChat = useAgent((s) => s.newChat);
  const createProject = useAgent((s) => s.createProject);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creatingProject, setCreatingProject] = useState(false);

  const byUpdated = (a: AgentChat, b: AgentChat) =>
    b.updatedAt - a.updatedAt;
  const pinned = chats.filter((c) => c.pinned).sort(byUpdated);
  const unfiled = chats
    .filter((c) => !c.pinned && c.projectId === null)
    .sort(byUpdated);
  const projectChats = (pid: string) =>
    chats.filter((c) => c.projectId === pid).sort(byUpdated);

  const toggleCollapsed = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="flex items-center px-2 pb-1 pt-1">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Agents
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              aria-label="New project"
              title="New project"
              className="grid h-5 w-5 place-items-center rounded-[5px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
            >
              <FolderPlus size={13} />
            </button>
          </div>
        </div>

        {creatingProject && (
          <NewProjectRow
            onDone={(name) => {
              if (name.trim()) createProject(name.trim());
              setCreatingProject(false);
            }}
          />
        )}

        <button
          type="button"
          onClick={() => newChat()}
          className="mt-0.5 flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
        >
          <Plus size={15} />
          New chat
        </button>
      </section>

      {pinned.length > 0 && (
        <section>
          <div className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Pinned
          </div>
          {pinned.map((c, i) => (
            <ChatRow key={c.id} chat={c} index={i} />
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <div className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Projects
          </div>
          {projects.map((p) => (
            <ProjectGroup
              key={p.id}
              project={p}
              chats={projectChats(p.id)}
              collapsed={collapsed.has(p.id)}
              onToggle={() => toggleCollapsed(p.id)}
            />
          ))}
        </section>
      )}

      <section>
        <div className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Chats
        </div>
        {unfiled.length === 0 ? (
          <p className="px-2 pt-1 text-[12px] leading-relaxed text-ink-3">
            No chats yet.
          </p>
        ) : (
          unfiled.map((c, i) => <ChatRow key={c.id} chat={c} index={i} />)
        )}
      </section>
    </div>
  );
}

/* ---------- rows ---------- */

function ChatRow({ chat, index = 0 }: { chat: AgentChat; index?: number }) {
  const active = useAgent((s) => s.activeChatId === chat.id);
  const running = useAgent((s) => s.runningChatId === chat.id);
  const selectChat = useAgent((s) => s.selectChat);
  const togglePinChat = useAgent((s) => s.togglePinChat);
  const deleteChat = useAgent((s) => s.deleteChat);

  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<MenuPos | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const openMenu = () => {
    const rect = dotsRef.current?.getBoundingClientRect();
    if (!rect) return;
    const flip = rect.bottom + 6 + 80 > window.innerHeight;
    setMenu({
      left: Math.max(8, Math.round(rect.right) - MENU_W),
      top: flip ? Math.round(rect.top) - 86 : Math.round(rect.bottom) + 6,
      flip,
    });
  };

  const Icon = chat.pinned ? PushPin : ChatCircle;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.28,
        delay: Math.min(index * 0.025, 0.25),
        ease: [0.16, 1, 0.3, 1],
      }}
      onClick={() => selectChat(chat.id)}
      className={`group relative flex h-7 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150 ${
        active ? "bg-elev text-ink" : "text-ink-2 hover:bg-hover"
      }`}
    >
      {active && (
        <motion.span
          layoutId="chat-active"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          className="absolute inset-y-0 left-0 my-auto h-3.5 w-[2px] rounded-full bg-accent"
        />
      )}
      <Icon size={15} className="shrink-0 text-ink-3" />
      <span className="flex-1 truncate">
        {chat.title.trim() === "" ? "New chat" : chat.title}
      </span>
      {running ? (
        <span
          title={`${AGENTS[chat.agent].name} is working`}
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
        />
      ) : (
        <span
          title={AGENTS[chat.agent].name}
          className={`shrink-0 font-mono text-[10px] text-ink-3 ${menu ? "hidden" : "group-hover:hidden"}`}
        >
          {chat.agent}
        </span>
      )}
      <button
        ref={dotsRef}
        type="button"
        aria-label="Chat actions"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(e) => {
          e.stopPropagation();
          openMenu();
        }}
        className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-3 transition-[opacity,color,background-color] duration-150 hover:bg-line hover:text-ink ${
          menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <DotsThree size={16} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          // Portals bubble through the React tree — keep menu clicks
          // from reaching the row's own onClick.
          <div onClick={(e) => e.stopPropagation()}>
            <AnimatePresence>
              {menu && (
                <motion.div
                  key="chat-menu-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setMenu(null)}
                  onWheel={() => setMenu(null)}
                  onContextMenu={() => setMenu(null)}
                />
              )}
              {menu && (
                <motion.div
                  key="chat-menu"
                  role="menu"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                  style={{ left: menu.left, top: menu.top }}
                  className={`fixed z-50 w-[148px] rounded-[8px] border border-line bg-elev p-1 shadow-[0_8px_24px_var(--color-shadow)] ${
                    menu.flip ? "origin-bottom-right" : "origin-top-right"
                  }`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      togglePinChat(chat.id);
                      setMenu(null);
                    }}
                    className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
                  >
                    {chat.pinned ? (
                      <PushPinSlash size={14} />
                    ) : (
                      <PushPin size={14} />
                    )}
                    {chat.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      deleteChat(chat.id);
                      setMenu(null);
                    }}
                    className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
                  >
                    <Trash size={14} />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </motion.div>
  );
}

function ProjectGroup({
  project,
  chats,
  collapsed,
  onToggle,
}: {
  project: AgentProject;
  chats: AgentChat[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const renameProject = useAgent((s) => s.renameProject);
  const deleteProject = useAgent((s) => s.deleteProject);
  const newChat = useAgent((s) => s.newChat);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [menu, setMenu] = useState<MenuPos | null>(null);
  const dotsRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const openMenu = () => {
    const rect = dotsRef.current?.getBoundingClientRect();
    if (!rect) return;
    const flip = rect.bottom + 6 + 120 > window.innerHeight;
    setMenu({
      left: Math.max(8, Math.round(rect.right) - MENU_W),
      top: flip ? Math.round(rect.top) - 126 : Math.round(rect.bottom) + 6,
      flip,
    });
  };

  const commitRename = () => {
    if (draft.trim()) renameProject(project.id, draft.trim());
    setRenaming(false);
  };

  return (
    <div>
      <div
        className="group relative flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-hover"
        onClick={onToggle}
      >
        <motion.span
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="grid h-4 w-4 shrink-0 place-items-center text-ink-3"
        >
          <CaretRight size={11} weight="bold" />
        </motion.span>
        <Folder size={14} className="shrink-0 text-ink-3" />
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Project name"
            className="h-5 w-full rounded-[4px] border border-line bg-panel-2 px-1 text-[12.5px] text-ink outline-none focus:border-accent-line"
          />
        ) : (
          <span className="flex-1 truncate">{project.name}</span>
        )}
        <button
          ref={dotsRef}
          type="button"
          aria-label="Project actions"
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            openMenu();
          }}
          className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-3 transition-[opacity,color,background-color] duration-150 hover:bg-line hover:text-ink ${
            menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <DotsThree size={16} />
        </button>

        {typeof document !== "undefined" &&
          createPortal(
            // Portals bubble through the React tree — keep menu clicks
            // from reaching the row's own onClick.
            <div onClick={(e) => e.stopPropagation()}>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    key="proj-menu-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="fixed inset-0 z-40"
                    onClick={() => setMenu(null)}
                    onWheel={() => setMenu(null)}
                    onContextMenu={() => setMenu(null)}
                  />
                )}
                {menu && (
                  <motion.div
                    key="proj-menu"
                    role="menu"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                    style={{ left: menu.left, top: menu.top }}
                    className={`fixed z-50 w-[168px] rounded-[8px] border border-line bg-elev p-1 shadow-[0_8px_24px_var(--color-shadow)] ${
                      menu.flip ? "origin-bottom-right" : "origin-top-right"
                    }`}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        newChat(project.id);
                        setMenu(null);
                      }}
                      className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                      <Plus size={14} />
                      New chat here
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setDraft(project.name);
                        setRenaming(true);
                        setMenu(null);
                      }}
                      className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                      <PencilSimple size={14} />
                      Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        deleteProject(project.id);
                        setMenu(null);
                      }}
                      className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                      <Trash size={14} />
                      Delete project
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>,
            document.body,
          )}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-[13px] border-l border-line-soft pl-1.5">
              {chats.length === 0 ? (
                <p className="px-2 py-1 text-[11.5px] text-ink-3">
                  No chats here yet.
                </p>
              ) : (
                chats.map((c, i) => (
                  <ChatRow key={c.id} chat={c} index={i} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NewProjectRow({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="flex h-7 items-center gap-1.5 rounded-[6px] px-2">
      <Folder size={14} className="shrink-0 text-ink-3" />
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => onDone(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(name);
          if (e.key === "Escape") onDone("");
        }}
        placeholder="Project name"
        aria-label="New project name"
        className="h-5 w-full rounded-[4px] border border-line bg-panel-2 px-1 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent-line"
      />
      <Check size={12} className="shrink-0 text-ink-3" />
    </div>
  );
}
