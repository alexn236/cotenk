import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  CircleNotch,
  Folder,
  Lightning,
  PaperPlaneRight,
  Paperclip,
  Plugs,
  PushPin,
  Square,
  Trash,
  Warning,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  useActiveChat,
  useAgent,
  type AgentMsg,
  type AgentStatus,
  type SentImage,
} from "@/lib/agent-store";
import {
  imageFiles,
  prepareImage,
  storeImage,
  useImageSrc,
} from "@/lib/images";
import { toast } from "@/lib/toast";
import { useAgentSetup } from "@/lib/agent-setup";
import { AGENTS } from "@/lib/agents";
import { usePermissions } from "@/lib/agent-permissions";
import { Markdown } from "@/components/editor/markdown";
import { useWorkspace } from "@/lib/store";
import { DESKTOP_ONLY_MESSAGE, isDesktop } from "@/lib/workspace";
import { ModelSelect } from "./model-select";
import {
  autosizeTextarea,
  useIsomorphicLayoutEffect,
} from "@/components/editor/utils";
import { AgentSwitch } from "./agent-switch";
import { useSuggest } from "@/components/ui/use-suggest";
import { referenceContext } from "@/lib/suggest";
import { slashContext } from "@/lib/slash";
import { useExtensions } from "@/lib/extensions";
import { newId } from "@/lib/ids";

const MAX_ATTACHMENTS = 5;

type Attachment = { id: string; blob: Blob; preview: string };

/** A picture in the transcript or the composer. */
function ChatImage({ src }: { src: string }) {
  const url = useImageSrc(src);
  return url ? (
    <img
      src={url}
      alt=""
      className="max-h-48 max-w-full rounded-[8px] border border-line-soft object-cover"
    />
  ) : (
    <span className="grid h-16 w-24 place-items-center rounded-[8px] border border-line-soft bg-panel-2 text-[11px] text-ink-3">
      Image
    </span>
  );
}

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
  const approval = usePermissions((s) => s.mode);
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
  const desktop = isDesktop();

  const agent = chat?.agent ?? defaultAgent;
  const agentName = AGENTS[agent].name;
  const setup = useAgentSetup((s) => s.setup[agent]);
  const checkSetup = useAgentSetup((s) => s.check);
  const connect = useAgentSetup((s) => s.connect);
  const connecting = useAgentSetup((s) => s.connecting);
  const ready = !!setup && setup.installed && setup.authed;

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
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

  // Composer grows with its text (typed, pasted or cleared after send)
  // up to its max height, then scrolls.
  useIsomorphicLayoutEffect(() => {
    autosizeTextarea(inputRef.current);
  }, [input]);

  // "@" or "[[" suggests pages and folders; they reach the agent as
  // real file paths.
  const suggest = useSuggest({
    ref: inputRef,
    value: input,
    onChange: setInput,
    mode: "agent",
    agent,
  });

  const addAttachments = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, MAX_ATTACHMENTS - attachments.length))) {
      try {
        const blob = await prepareImage(f);
        setAttachments((cur) =>
          cur.length >= MAX_ATTACHMENTS
            ? cur
            : [...cur, { id: newId(), blob, preview: URL.createObjectURL(blob) }],
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { tone: "error" });
      }
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((cur) => {
      cur.filter((a) => a.id === id).forEach((a) => URL.revokeObjectURL(a.preview));
      return cur.filter((a) => a.id !== id);
    });

  const canSend = (!!input.trim() || attachments.length > 0) && !running && !uploading;

  const submit = async () => {
    if (!canSend) return;
    const text = input.trim();
    const files = attachments;
    let images: SentImage[] = [];
    if (files.length > 0) {
      setUploading(true);
      try {
        images = await Promise.all(
          files.map(async (a) => ({
            blob: a.blob,
            ref: await storeImage(a.blob, "chat"),
          })),
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { tone: "error" });
        return;
      } finally {
        setUploading(false);
      }
    }
    setInput("");
    setAttachments([]);
    files.forEach((a) => URL.revokeObjectURL(a.preview));
    const { docs, folders } = useWorkspace.getState();
    const context =
      [
        referenceContext(text, docs, folders),
        slashContext(text, useExtensions.getState().items, agent),
      ]
        .filter(Boolean)
        .join("\n\n") || undefined;
    void send(text, { context, images });
  };

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest.onKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
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
              className="min-w-0 max-w-[480px] flex-1 rounded-[4px] border border-line bg-panel-2 px-1.5 py-0.5 text-[12.5px] text-ink outline-none focus:border-accent-line"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(chat.title);
                setEditingTitle(true);
              }}
              title="Rename chat"
              className="min-w-0 max-w-[480px] truncate rounded-[4px] px-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
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
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3"
          title={`${agentName} · ${meta.label}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {agentName}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
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
                          onClick={() =>
                            useAgentSetup.getState().openGuide(agent)
                          }
                          className="flex h-8 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-[12.5px] font-medium text-on-accent transition-colors hover:bg-accent-2"
                        >
                          <Plugs size={14} />
                          Set up {agentName}
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
                  <div className="flex max-w-[80%] flex-col items-end gap-2">
                    {m.images && m.images.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.images.map((src) => (
                          <ChatImage key={src} src={src} />
                        ))}
                      </div>
                    )}
                    {m.text && (
                      <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-[12px] border border-line-soft bg-panel-2 px-3.5 py-2 text-[14px] leading-[1.6] text-ink">
                        {m.text}
                      </div>
                    )}
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
                  onClick={() => useAgentSetup.getState().openGuide(agent)}
                  className="shrink-0 text-[12px] text-accent hover:underline"
                >
                  Fix setup
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
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = imageFiles(e.currentTarget.files);
              e.currentTarget.value = "";
              if (files.length > 0) void addAttachments(files);
            }}
          />
          <div
            data-image-drop=""
            onPaste={(e) => {
              const files = imageFiles(e.clipboardData.files);
              if (files.length === 0) return;
              e.preventDefault();
              void addAttachments(files);
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              const files = imageFiles(e.dataTransfer.files);
              if (files.length === 0) return;
              e.preventDefault();
              void addAttachments(files);
            }}
            className="rounded-[12px] border border-line bg-panel px-3 py-2 shadow-[0_2px_12px_var(--color-shadow)] transition-colors duration-150 focus-within:border-accent-line"
          >
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div key={a.id} className="group relative">
                    <img
                      src={a.preview}
                      alt=""
                      className="h-14 w-14 rounded-[8px] border border-line-soft object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label="Remove image"
                      className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-elev text-ink-2 hover:text-ink"
                    >
                      <X size={9} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              aria-label="Attach image"
              title="Attach image (or paste / drop one)"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2 disabled:opacity-35"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onComposerKey}
              {...suggest.fieldProps}
              placeholder={`Message ${agentName}… (@ a page, / a command or skill)`}
              aria-label={`Message ${agentName}`}
              spellCheck={false}
              className="block max-h-[220px] min-w-0 flex-1 resize-none overflow-y-auto break-words bg-transparent py-1 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
            />
            {suggest.menu}
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
                onClick={() => void submit()}
                disabled={!canSend}
                aria-label="Send"
                title="Send (Enter)"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-accent text-on-accent transition-[background-color,transform] duration-150 ease-out-expo hover:bg-accent-2 active:scale-[0.97] disabled:opacity-35"
              >
                <PaperPlaneRight size={15} weight="fill" />
              </button>
            )}
          </div>
          </div>
          <p className="mt-2 flex items-center justify-center gap-3 text-center font-mono text-[10.5px] text-ink-3">
            <span>
              {AGENTS[agent].name.toLowerCase()} · acp · {approval === "auto"
                ? "edits auto-approved"
                : "you review edits"}
              , undo with ctrl z on the page
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
