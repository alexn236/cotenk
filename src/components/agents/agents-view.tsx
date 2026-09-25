import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CaretDown,
  Check,
  Cpu,
  Folder,
  Lightning,
  PaperPlaneRight,
  Plugs,
  PushPin,
  Square,
  Trash,
  Wrench,
} from "@phosphor-icons/react";
import {
  useActiveChat,
  useAgent,
  type AgentStatus,
} from "@/lib/agent-store";
import { Markdown } from "@/components/editor/markdown";
import { useWorkspace } from "@/lib/store";
import { DESKTOP_ONLY_MESSAGE, isDesktop } from "@/lib/workspace";
import { ModelPicker } from "./model-picker";

const SUGGESTIONS = [
  "Summarize what this workspace contains",
  "Collect all open tasks and suggest priorities for this week",
  "Create a project brief page for a new idea I describe",
  "Build an interactive dashboard page from my notes",
];

function statusMeta(status: AgentStatus): { label: string; dot: string } {
  switch (status) {
    case "running":
      return { label: "Running", dot: "bg-accent animate-pulse" };
    case "starting":
      return { label: "Starting", dot: "bg-accent animate-pulse" };
    case "ready":
      return { label: "Ready", dot: "bg-emerald-500/70" };
    case "error":
      return { label: "Error", dot: "bg-danger" };
    default:
      return { label: "Idle", dot: "bg-ink-3/50" };
  }
}

function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * Agents view — chat surface wired to the local `devin acp` process
 * (via the Tauri backend). Chats persist to Supabase and can be
 * pinned or filed under projects from the header bar.
 */
export function AgentsView() {
  const status = useAgent((s) => s.status);
  const error = useAgent((s) => s.error);
  const thought = useAgent((s) => s.thought);
  const usage = useAgent((s) => s.usage);
  const models = useAgent((s) => s.models);
  const projects = useAgent((s) => s.projects);
  const send = useAgent((s) => s.send);
  const stop = useAgent((s) => s.stop);
  const refresh = useAgent((s) => s.refresh);
  const renameChat = useAgent((s) => s.renameChat);
  const deleteChat = useAgent((s) => s.deleteChat);
  const togglePinChat = useAgent((s) => s.togglePinChat);
  const setChatModel = useAgent((s) => s.setChatModel);
  const defaultModel = useAgent((s) => s.defaultModel);
  const setDefaultModel = useAgent((s) => s.setDefaultModel);
  const currentModel = useAgent((s) => s.currentModel);
  const assignChat = useAgent((s) => s.assignChat);
  const chat = useActiveChat();
  const reduceMotion = useReducedMotion();
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const setSettingsSection = useWorkspace((s) => s.setSettingsSection);
  // Missing binary / credentials surface as bootstrap errors.
  const desktop = isDesktop();
  const needsSetup =
    status === "error" ||
    (status === "idle" && !!error) ||
    /credential|not found|spawn/i.test(error ?? "");

  const [input, setInput] = useState("");
  const [menu, setMenu] = useState<"model" | "project" | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const running = status === "running" || status === "starting";
  const meta = statusMeta(status);
  const messages = useMemo(() => chat?.messages ?? [], [chat]);
  const activeModel = chat?.model ?? defaultModel;
  const effectiveModel = activeModel || currentModel || "";
  const modelName = effectiveModel
    ? (models.find((m) => m.value === effectiveModel)?.name ??
      effectiveModel)
    : "Model";

  const pickModel = (value: string) => {
    if (chat) setChatModel(chat.id, value);
    else setDefaultModel(value);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thought]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.select();
  }, [editingTitle]);

  const submit = () => {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "0px";
    void send(text);
  };

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const commitTitle = () => {
    if (chat && titleDraft.trim()) renameChat(chat.id, titleDraft.trim());
    setEditingTitle(false);
  };

  const iconBtn =
    "grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 ease-out-expo hover:bg-hover hover:text-ink-2";

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        {chat ? (
          editingTitle ? (
            <input
              ref={titleRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.currentTarget.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              aria-label="Chat title"
              className="w-48 rounded-[4px] border border-line bg-panel-2 px-1.5 py-0.5 text-[12.5px] text-ink outline-none focus:border-accent-line"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(chat.title);
                setEditingTitle(true);
              }}
              title="Rename chat"
              className="max-w-[220px] truncate rounded-[4px] px-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              {chat.title}
            </button>
          )
        ) : (
          <span className="text-[12.5px] font-medium text-ink-2">
            Agents
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3">
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {chat && (
            <>
              {/* project assign */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setMenu((m) => (m === "project" ? null : "project"))
                  }
                  aria-label="Move to project"
                  title={
                    chat.projectId
                      ? `Project: ${projects.find((p) => p.id === chat.projectId)?.name}`
                      : "Move to project"
                  }
                  className={`${iconBtn} ${chat.projectId ? "text-accent" : ""}`}
                >
                  <Folder size={15} />
                </button>
                <HeaderMenu
                  open={menu === "project"}
                  onClose={() => setMenu(null)}
                >
                  <MenuItem
                    active={chat.projectId === null}
                    label="No project"
                    onClick={() => {
                      assignChat(chat.id, null);
                      setMenu(null);
                    }}
                  />
                  {projects.map((p) => (
                    <MenuItem
                      key={p.id}
                      active={chat.projectId === p.id}
                      label={p.name}
                      onClick={() => {
                        assignChat(chat.id, p.id);
                        setMenu(null);
                      }}
                    />
                  ))}
                  {projects.length === 0 && (
                    <p className="px-3 py-2 text-[11.5px] text-ink-3">
                      No projects yet — create one in the sidebar.
                    </p>
                  )}
                </HeaderMenu>
              </div>

              <button
                type="button"
                onClick={() => togglePinChat(chat.id)}
                aria-label={chat.pinned ? "Unpin chat" : "Pin chat"}
                title={chat.pinned ? "Unpin" : "Pin"}
                className={`${iconBtn} ${chat.pinned ? "text-accent" : ""}`}
              >
                <PushPin
                  size={15}
                  weight={chat.pinned ? "fill" : "regular"}
                />
              </button>
              <button
                type="button"
                onClick={() => deleteChat(chat.id)}
                aria-label="Delete chat"
                title="Delete chat"
                className={`${iconBtn} hover:text-danger`}
              >
                <Trash size={15} />
              </button>
            </>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-6 py-8 md:px-16">
          {messages.length === 0 && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4 py-16 text-center"
            >
              <div className="grid h-11 w-11 place-items-center rounded-[12px] border border-line bg-panel">
                <Lightning size={20} className="text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-2">
                  Devin CLI · your workspace agent
                </p>
                <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-ink-3">
                  Runs locally over ACP and reads and writes the same pages
                  you do. Ask it to draft, restructure, extract tasks or
                  build interactive widgets.
                </p>
              </div>
              {!desktop ? (
                <p className="max-w-[380px] rounded-[10px] border border-dashed border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
                  {DESKTOP_ONLY_MESSAGE} Pages, tasks and the marketplace
                  work everywhere.
                </p>
              ) : needsSetup && (
                <button
                  type="button"
                  onClick={() => {
                    setSettingsSection("agents");
                    setRailSection("settings");
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-[12.5px] font-medium text-on-accent transition-colors hover:bg-accent-2"
                >
                  <Plugs size={14} />
                  Connect Devin CLI
                </button>
              )}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink-2 transition-colors duration-150 ease-out-expo hover:bg-hover hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((m) => {
            if (m.role === "tool") {
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-1 font-mono text-[11.5px] text-ink-3"
                >
                  <Wrench size={12} className="shrink-0 text-accent" />
                  <span className="truncate">{m.text}</span>
                </div>
              );
            }
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-[12px] border border-line-soft bg-panel-2 px-3.5 py-2 text-[14px] leading-[1.6] text-ink">
                    {m.text}
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className="min-w-0">
                {m.text ? (
                  <Markdown>{m.text}</Markdown>
                ) : m.streaming ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    Working…
                  </span>
                ) : null}
              </div>
            );
          })}

          {thought && running && (
            <p className="truncate px-1 font-mono text-[11px] italic text-ink-3">
              {thought.slice(-160)}
            </p>
          )}
          {error && desktop && (
            <p className="rounded-[8px] border border-line bg-panel-2 px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-line-soft px-6 pb-5 pt-3 md:px-16">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="flex items-end gap-2 rounded-[12px] border border-line bg-panel px-3 py-2 shadow-[0_2px_12px_var(--color-shadow)] transition-colors duration-150 focus-within:border-accent-line">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.currentTarget.value);
                const el = e.currentTarget;
                el.style.height = "0px";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onKeyDown={onComposerKey}
              placeholder="Message Devin…"
              aria-label="Message Devin"
              spellCheck={false}
              className="block max-h-[180px] w-full resize-none bg-transparent py-1 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
            />
            {/* model picker — opens upward */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() =>
                  setMenu((m) => (m === "model" ? null : "model"))
                }
                title="Select model"
                className="flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-panel-2 px-2 text-[11.5px] text-ink-2 transition-colors duration-150 hover:bg-hover"
              >
                <Cpu size={13} className="text-ink-3" />
                <span className="max-w-[130px] truncate">{modelName}</span>
                <CaretDown size={10} className="text-ink-3" />
              </button>
              <AnimatePresence>
                {menu === "model" && (
                  <>
                    <div
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setMenu(null)}
                    />
                    <ModelPicker
                      models={models}
                      active={activeModel}
                      onPick={pickModel}
                      onClose={() => setMenu(null)}
                    />
                  </>
                )}
              </AnimatePresence>
            </div>

            {running ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                title="Stop"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-danger/15 text-danger transition-colors duration-150 hover:bg-danger/25"
              >
                <Square size={13} weight="fill" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!input.trim()}
                aria-label="Send"
                title="Send"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-accent text-on-accent transition-[background-color,transform] duration-150 ease-out-expo hover:bg-accent-2 active:scale-[0.97] disabled:opacity-35"
              >
                <PaperPlaneRight size={15} weight="fill" />
              </button>
            )}
          </div>
          <p className="mt-2 flex items-center justify-center gap-3 text-center font-mono text-[10.5px] text-ink-3">
            <span>devin acp · permissions auto-approved</span>
            {usage && usage.size > 0 && (
              <span>
                ctx {formatK(usage.used)}/{formatK(usage.size)}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- dropdown primitives ---------- */

function HeaderMenu({
  open,
  onClose,
  wide,
  up,
  children,
}: {
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  /** Render above the anchor instead of below. */
  up?: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 cursor-default"
            onClick={onClose}
          />
          <motion.div
            role="menu"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
            transition={
              reduceMotion
                ? { duration: 0.1 }
                : { type: "spring", duration: 0.18, bounce: 0 }
            }
            className={`absolute right-0 z-40 max-h-[320px] overflow-y-auto rounded-[10px] border border-line bg-panel p-1 shadow-[0_16px_48px_var(--color-shadow)] ${
              up
                ? "bottom-full mb-1.5 origin-bottom"
                : "top-full mt-1.5 origin-top"
            } ${wide ? "w-[240px]" : "w-[180px]"}`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MenuItem({
  label,
  desc,
  active,
  onClick,
}: {
  label: string;
  desc?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors duration-100 ease-out-expo ${
        active ? "bg-hover" : "hover:bg-hover"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">
          {label}
        </span>
        {desc && (
          <span className="block truncate font-mono text-[10px] text-ink-3">
            {desc}
          </span>
        )}
      </span>
      {active && <Check size={12} className="shrink-0 text-accent" />}
    </button>
  );
}
