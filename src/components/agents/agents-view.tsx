import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  CircleNotch,
  Folder,
  Lightning,
  PaperPlaneRight,
  Plugs,
  PushPin,
  Square,
  Trash,
  Warning,
  Wrench,
} from "@phosphor-icons/react";
import {
  useActiveChat,
  useAgent,
  type AgentMsg,
  type AgentStatus,
} from "@/lib/agent-store";
import { useAgentSetup } from "@/lib/agent-setup";
import { AGENTS } from "@/lib/agents";
import { Markdown } from "@/components/editor/markdown";
import { useWorkspace } from "@/lib/store";
import { DESKTOP_ONLY_MESSAGE, isDesktop } from "@/lib/workspace";
import { ModelSelect } from "./model-select";
import { AgentSwitch } from "./agent-switch";

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
 * Agents view — chat surface wired to the local ACP agents (Devin CLI,
 * Claude Code) via the Tauri backend. Chats persist to Supabase and can
 * be pinned or filed under projects from the header bar.
 */
export function AgentsView() {
  const status = useAgent((s) => s.status);
  const error = useAgent((s) => s.error);
  const errorAgent = useAgent((s) => s.errorAgent);
  const thought = useAgent((s) => s.thought);
  const usage = useAgent((s) => s.usage);
  const projects = useAgent((s) => s.projects);
  const runningChatId = useAgent((s) => s.runningChatId);
  const defaultAgent = useAgent((s) => s.defaultAgent);
  const setDefaultAgent = useAgent((s) => s.setDefaultAgent);
  const setChatAgent = useAgent((s) => s.setChatAgent);
  const send = useAgent((s) => s.send);
  const stop = useAgent((s) => s.stop);
  const refresh = useAgent((s) => s.refresh);
  const renameChat = useAgent((s) => s.renameChat);
  const deleteChat = useAgent((s) => s.deleteChat);
  const selectChat = useAgent((s) => s.selectChat);
  const togglePinChat = useAgent((s) => s.togglePinChat);
  const assignChat = useAgent((s) => s.assignChat);
  const chat = useActiveChat();
  const reduceMotion = useReducedMotion();
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const setSettingsSection = useWorkspace((s) => s.setSettingsSection);
  const desktop = isDesktop();

  const agent = chat?.agent ?? defaultAgent;
  const agentName = AGENTS[agent].name;
  const setup = useAgentSetup((s) => s.setup[agent]);
  const checkSetup = useAgentSetup((s) => s.check);
  const connect = useAgentSetup((s) => s.connect);
  const connecting = useAgentSetup((s) => s.connecting);
  const ready = !!setup && setup.installed && setup.authed;

  const [input, setInput] = useState("");
  const [menu, setMenu] = useState<"project" | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const running = status === "running" || status === "starting";
  // One turn at a time: another chat's turn blocks this composer.
  const busyElsewhere = running && !!runningChatId && runningChatId !== chat?.id;
  const runningHere = running && !busyElsewhere;
  const meta = statusMeta(busyElsewhere ? "ready" : status);
  const messages = useMemo(() => chat?.messages ?? [], [chat]);
  const chatError =
    error && (errorAgent === null || errorAgent === agent) ? error : null;
  const last = messages.at(-1);
  const showWorking =
    runningHere && !(last?.role === "agent" && last.streaming);

  // Probe the agent and preload its models (the default model works
  // without them, so this only runs when the agent is ready).
  useEffect(() => {
    if (!desktop) return;
    void checkSetup(agent).then((s) => {
      if (s?.installed && s.authed) void refresh(agent);
    });
  }, [desktop, agent, checkSetup, refresh]);

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

  const openAgentSettings = () => {
    setSettingsSection("agents");
    setRailSection("settings");
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
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3"
          title={`${agentName} · ${meta.label}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {agentName}
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
                  Your workspace agent
                </p>
                <p className="mt-1.5 max-w-[400px] text-[12.5px] leading-relaxed text-ink-3">
                  Runs locally and reads and writes the same pages you do.
                  Ask it to draft, restructure, extract tasks or build
                  interactive widgets — you watch the changes land.
                </p>
              </div>
              {!desktop ? (
                <p className="max-w-[380px] rounded-[10px] border border-dashed border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
                  {DESKTOP_ONLY_MESSAGE} Pages, tasks and the marketplace
                  work everywhere.
                </p>
              ) : (
                <div className="flex w-full max-w-[360px] flex-col items-center gap-2">
                  <div className="w-full">
                    <AgentSwitch
                      value={agent}
                      onChange={(k) =>
                        chat ? setChatAgent(chat.id, k) : setDefaultAgent(k)
                      }
                    />
                  </div>
                  <p className="text-[11.5px] text-ink-3">
                    {setup ? `${agentName} · ${setup.detail}` : "Checking…"}
                  </p>
                  {setup && !ready && (
                    <div className="flex flex-col items-center gap-2">
                      {setup.hint && (
                        <p className="max-w-[340px] text-[12px] leading-relaxed text-ink-3">
                          {setup.hint}
                        </p>
                      )}
                      {setup.installed ? (
                        <button
                          type="button"
                          disabled={!!connecting}
                          onClick={() => void connect(agent)}
                          className="flex h-8 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-[12.5px] font-medium text-on-accent transition-colors hover:bg-accent-2 disabled:opacity-60"
                        >
                          <Plugs size={14} />
                          {connecting === agent
                            ? "Waiting for sign-in…"
                            : `Connect ${agentName}`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openAgentSettings}
                          className="text-[12px] text-accent hover:underline"
                        >
                          Setup help in Settings → Agents
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={running}
                    onClick={() => void send(s)}
                    className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink-2 transition-colors duration-150 ease-out-expo hover:bg-hover hover:text-ink disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((m) => {
            if (m.role === "tool") {
              return <ToolRow key={m.id} msg={m} live={runningHere} />;
            }
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-[12px] border border-line-soft bg-panel-2 px-3.5 py-2 text-[14px] leading-[1.6] text-ink">
                    {m.text}
                  </div>
                </div>
              );
            }
            return m.text ? (
              <div key={m.id} className="min-w-0">
                <Markdown>{m.text}</Markdown>
              </div>
            ) : null;
          })}

          {showWorking && (
            <p className="flex min-w-0 items-center gap-1.5 px-1 text-[12.5px] text-ink-3">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
              {status === "starting" ? (
                `Starting ${agentName}…`
              ) : thought ? (
                <span className="truncate font-mono text-[11px] italic">
                  {thought.slice(-160)}
                </span>
              ) : (
                "Working…"
              )}
            </p>
          )}
          {chatError && desktop && (
            <div className="flex items-start justify-between gap-3 rounded-[8px] border border-line bg-panel-2 px-3 py-2 text-[12.5px] text-danger">
              <span className="min-w-0">{chatError}</span>
              {/sign|credential|not found|install/i.test(chatError) && (
                <button
                  type="button"
                  onClick={openAgentSettings}
                  className="shrink-0 text-[12px] text-accent hover:underline"
                >
                  Open settings
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-line-soft px-6 pb-5 pt-3 md:px-16">
        <div className="mx-auto w-full max-w-[720px]">
          {busyElsewhere && (
            <button
              type="button"
              onClick={() => runningChatId && selectChat(runningChatId)}
              className="mb-2 flex w-full items-center justify-center gap-1.5 text-[11.5px] text-ink-3 hover:text-ink-2"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              An agent is working in another chat — open it
            </button>
          )}
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
              placeholder={`Message ${agentName}…`}
              aria-label={`Message ${agentName}`}
              spellCheck={false}
              className="block max-h-[180px] w-full resize-none bg-transparent py-1 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
            />
            <ModelSelect chatId={chat?.id} placement="up" size="md" />

            {runningHere ? (
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
                disabled={!input.trim() || running}
                aria-label="Send"
                title="Send (Enter)"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-accent text-on-accent transition-[background-color,transform] duration-150 ease-out-expo hover:bg-accent-2 active:scale-[0.97] disabled:opacity-35"
              >
                <PaperPlaneRight size={15} weight="fill" />
              </button>
            )}
          </div>
          <p className="mt-2 flex items-center justify-center gap-3 text-center font-mono text-[10.5px] text-ink-3">
            <span>
              {agent === "claude" ? "claude code" : "devin"} · acp · edits
              auto-approved, undo with ctrl z on the page
            </span>
            {usage && usage.size > 0 && runningChatId === null && (
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

/** One tool call; updates of the same call edit this row in place. */
function ToolRow({ msg, live }: { msg: AgentMsg; live: boolean }) {
  const pending = msg.status === "pending" || msg.status === "in_progress";
  const failed = msg.status === "failed";
  return (
    <div className="flex items-center gap-2 px-1 font-mono text-[11.5px] text-ink-3">
      {pending && live ? (
        <CircleNotch size={12} className="shrink-0 animate-spin text-accent" />
      ) : failed ? (
        <Warning size={12} className="shrink-0 text-danger" />
      ) : msg.status ? (
        <Check size={12} className="shrink-0 text-accent" />
      ) : (
        <Wrench size={12} className="shrink-0 text-accent" />
      )}
      <span className="truncate">{msg.text}</span>
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
