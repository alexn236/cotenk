import { create } from "zustand";
import { getSupabase } from "./supabase";
import {
  acpClient,
  onAgentCommands,
  type AgentCommand,
  type AgentEvent,
} from "./agent/acp-client";
import type { ModelOption } from "./agent-models";
import { workspacePreamble } from "./agent-context";
import { AGENT_KINDS, isAgentKind, type AgentKind } from "./agents";
import { setAgentRunning, track } from "./analytics";
import { newId } from "./ids";
import { blobToBase64 } from "./images";

export type AgentRole = "user" | "agent" | "tool";

export type AgentMsg = {
  id: string;
  role: AgentRole;
  text: string;
  /** Tool rows: pending | in_progress | completed | failed. */
  status?: string;
  /** Live-updating row while a turn runs. */
  streaming?: boolean;
  /** User rows: attached pictures (`cotenk-image:` refs or data URLs). */
  images?: string[];
};

/** A picture sent with a turn: the file for the agent, its stored reference. */
export type SentImage = { blob: Blob; ref: string };

export type AgentChat = {
  id: string;
  projectId: string | null;
  /** Which local agent this chat talks to. Fixed after the first turn. */
  agent: AgentKind;
  title: string;
  /** Model id, "" = the agent's account default. */
  model: string;
  pinned: boolean;
  messages: AgentMsg[];
  acpSessionId: string | null;
  updatedAt: number;
};

export type AgentProject = {
  id: string;
  name: string;
};

export type AgentStatus =
  | "idle"
  | "starting"
  | "ready"
  | "running"
  | "error";

export type { ModelOption };

type PerAgent<T> = Record<AgentKind, T>;

type AgentState = {
  status: AgentStatus;
  chats: AgentChat[];
  projects: AgentProject[];
  activeChatId: string | null;
  /** Chat whose turn is running (one turn at a time). */
  runningChatId: string | null;
  models: PerAgent<ModelOption[]>;
  /** Slash commands each agent offers itself (/mcp, /review, …). */
  commands: PerAgent<AgentCommand[]>;
  /** Account default model per agent, as reported over ACP. */
  currentModel: PerAgent<string | null>;
  /** Agent for new chats and one-off requests (Ask agent, tasks, …). */
  defaultAgent: AgentKind;
  /** Model new chats start with, per agent ("" = account default). */
  defaultModels: PerAgent<string>;
  /** Latest streamed thought — status line while running. */
  thought: string | null;
  /** Context usage of the last turn (tokens used / window size). */
  usage: { used: number; size: number } | null;
  error: string | null;
  /** Agent the error came from, so other chats don't show it. */
  errorAgent: AgentKind | null;
  hydrated: boolean;

  /** Boots an agent (default: the active chat's) and loads its models. */
  refresh: (agent?: AgentKind) => Promise<void>;
  /**
   * Sends a turn. `context` is prepended to what the agent receives but
   * not shown in the transcript (page paths, task details, …).
   */
  send: (
    text: string,
    opts?: { context?: string; images?: SentImage[] },
  ) => Promise<void>;
  stop: () => void;

  newChat: (projectId?: string | null, agent?: AgentKind) => void;
  selectChat: (id: string) => void;
  closeChat: () => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  togglePinChat: (id: string) => void;
  setChatModel: (id: string, model: string) => void;
  /** Only before the first message — a session belongs to one agent. */
  setChatAgent: (id: string, agent: AgentKind) => void;
  setDefaultAgent: (agent: AgentKind) => void;
  setDefaultModel: (agent: AgentKind, model: string) => void;
  assignChat: (id: string, projectId: string | null) => void;

  createProject: (name: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
};

let msgCounter = 0;
const nextMsgId = () => `m${Date.now().toString(36)}-${msgCounter++}`;

const uid = () => newId();

let running: { chatId: string; agent: AgentKind } | null = null;

/* ---------- local preferences ---------- */

const AGENT_KEY = "cotenk-default-agent";
// Devin keeps the original key so existing choices survive.
const modelKey = (a: AgentKind) =>
  a === "devin" ? "cotenk-default-model" : `cotenk-default-model-${a}`;

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** Someone picked an agent on this device (vs. the built-in default). */
export const hasAgentPreference = () => isAgentKind(readPref(AGENT_KEY));

const perAgent = <T>(fn: (a: AgentKind) => T): PerAgent<T> =>
  Object.fromEntries(AGENT_KINDS.map((a) => [a, fn(a)])) as PerAgent<T>;

/* ---------- supabase persistence ---------- */

/** Cleared when the `agent` column migration hasn't been applied yet. */
let hasAgentColumn = true;
/** Pushes whatever is pending right now (set while a sync runs). */
let flushActive: (() => Promise<void>) | null = null;

type ChatRow = {
  id: string;
  project_id: string | null;
  agent?: string | null;
  title: string;
  model: string;
  pinned: boolean;
  messages: AgentMsg[];
  acp_session_id: string | null;
  updated_at: number | string;
};

const toChat = (r: ChatRow): AgentChat => ({
  id: r.id,
  projectId: r.project_id,
  // Chats from before Claude Code support were all Devin chats.
  agent: isAgentKind(r.agent) ? r.agent : "devin",
  title: r.title,
  model: r.model ?? "",
  pinned: r.pinned,
  messages: Array.isArray(r.messages)
    ? r.messages.map((m) => ({ ...m, streaming: false }))
    : [],
  acpSessionId: r.acp_session_id ?? null,
  updatedAt: Number(r.updated_at) || Date.now(),
});

const toChatRow = (c: AgentChat, userId: string) => ({
  id: c.id,
  user_id: userId,
  project_id: c.projectId,
  ...(hasAgentColumn ? { agent: c.agent } : {}),
  title: c.title,
  model: c.model,
  pinned: c.pinned,
  messages: c.messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    ...(m.status ? { status: m.status } : {}),
    ...(m.images?.length ? { images: m.images } : {}),
  })),
  acp_session_id: c.acpSessionId,
  updated_at: c.updatedAt,
});

/** The chat tables don't exist (migration pending) — not worth retrying. */
const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/i.test(e.message ?? ""));

/** Pushes pending chat changes now (before sign-out). */
export async function flushAgentSync(): Promise<void> {
  await flushActive?.();
}

/**
 * Chat sync for one signed-in user — same rules as the page sync:
 *
 *  - Nothing is pushed before the first pull landed (retried until it
 *    does). An offline start used to push an empty list and delete
 *    every chat on the server.
 *  - Only chats/projects that changed since the last push are uploaded
 *    (it used to re-upload every chat with its full history).
 *  - Only rows deleted here are deleted remotely — "missing locally" is
 *    not a delete. Chats made on another device used to vanish as soon
 *    as this one saved anything.
 */
export function initAgentSync(userId: string): () => void {
  const sb = getSupabase();
  let disposed = false;
  let pulled = false;
  let pullFailures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let dirty = false;
  let applyingRemote = false;
  /** Objects that match the server (chats/projects are immutable). */
  const pushedChats = new WeakSet<AgentChat>();
  const pushedProjects = new WeakSet<AgentProject>();
  /** Removed locally, not yet deleted on the server. */
  const deletedChats = new Set<string>();
  const deletedProjects = new Set<string>();

  const pushOnce = async () => {
    const { chats, projects } = useAgent.getState();
    const projectRows = projects.filter((p) => !pushedProjects.has(p));
    const chatRows = chats.filter((c) => !pushedChats.has(c));
    const chatDeletes = [...deletedChats];
    const projectDeletes = [...deletedProjects];
    // Projects first (chats reference them), project deletes last.
    if (projectRows.length > 0) {
      const { error } = await sb.from("agent_projects").upsert(
        projectRows.map((p) => ({ id: p.id, user_id: userId, name: p.name })),
      );
      if (error) throw error;
      projectRows.forEach((p) => pushedProjects.add(p));
    }
    if (chatRows.length > 0) {
      const rows = chatRows.map((c) => toChatRow(c, userId));
      let { error } = await sb.from("agent_chats").upsert(rows);
      // Migration 20260925 not applied yet — keep saving without it.
      if (error && hasAgentColumn && /agent/.test(error.message)) {
        hasAgentColumn = false;
        ({ error } = await sb
          .from("agent_chats")
          .upsert(rows.map(({ agent: _agent, ...rest }) => rest)));
      }
      if (error) throw error;
      chatRows.forEach((c) => pushedChats.add(c));
    }
    if (chatDeletes.length > 0) {
      const { error } = await sb
        .from("agent_chats")
        .delete()
        .in("id", chatDeletes);
      if (error) throw error;
      chatDeletes.forEach((id) => deletedChats.delete(id));
    }
    if (projectDeletes.length > 0) {
      const { error } = await sb
        .from("agent_projects")
        .delete()
        .in("id", projectDeletes);
      if (error) throw error;
      projectDeletes.forEach((id) => deletedProjects.delete(id));
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
      } catch {
        // Pending rows stay pending — try again later.
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
    timer = setTimeout(() => void flush(), 800);
  };

  flushActive = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await flush();
  };

  const pull = async () => {
    const [p, c] = await Promise.all([
      sb.from("agent_projects").select("id, name").order("created_at"),
      // `*` so the pull works with and without the `agent` column.
      sb
        .from("agent_chats")
        .select("*")
        .order("updated_at", { ascending: false }),
    ]);
    if (disposed) return;
    const error = p.error ?? c.error;
    if (error) {
      if (missingTable(error)) {
        // Tables missing (migration pending) — chats stay in memory.
        useAgent.setState({ hydrated: true });
        return;
      }
      pullFailures += 1;
      retryTimer = setTimeout(
        () => void pull(),
        Math.min(60_000, 3000 * 2 ** Math.min(pullFailures, 5)),
      );
      return;
    }
    const rows = (c.data ?? []) as unknown as ChatRow[];
    hasAgentColumn = rows.length === 0 || "agent" in rows[0];
    const remoteChats = rows.map(toChat);
    const remoteProjects: AgentProject[] = (p.data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
    }));
    remoteChats.forEach((x) => pushedChats.add(x));
    remoteProjects.forEach((x) => pushedProjects.add(x));

    // Chats started while the pull was in flight are kept (and pushed);
    // a local copy that is newer than the server's wins.
    const st = useAgent.getState();
    const localById = new Map(st.chats.map((x) => [x.id, x]));
    const remoteIds = new Set(remoteChats.map((x) => x.id));
    const chats = [
      ...st.chats.filter((x) => !remoteIds.has(x.id)),
      ...remoteChats.map((r) => {
        const l = localById.get(r.id);
        return l && l.updatedAt > r.updatedAt ? l : r;
      }),
    ];
    const remoteProjectIds = new Set(remoteProjects.map((x) => x.id));
    const projects = [
      ...remoteProjects,
      ...st.projects.filter((x) => !remoteProjectIds.has(x.id)),
    ];
    applyingRemote = true;
    try {
      useAgent.setState({
        projects,
        chats,
        activeChatId: st.activeChatId ?? chats[0]?.id ?? null,
        hydrated: true,
      });
    } finally {
      applyingRemote = false;
    }
    pulled = true;
    await flush();
  };

  const unsub = useAgent.subscribe((s, prev) => {
    if (s.chats === prev.chats && s.projects === prev.projects) return;
    if (!applyingRemote) {
      if (s.chats !== prev.chats) {
        const now = new Set(s.chats.map((x) => x.id));
        for (const x of prev.chats) if (!now.has(x.id)) deletedChats.add(x.id);
        for (const id of now) deletedChats.delete(id);
      }
      if (s.projects !== prev.projects) {
        const now = new Set(s.projects.map((x) => x.id));
        for (const x of prev.projects) {
          if (!now.has(x.id)) deletedProjects.add(x.id);
        }
        for (const id of now) deletedProjects.delete(id);
      }
    }
    schedule();
  });

  const onOnline = () => {
    if (!pulled) {
      if (retryTimer) clearTimeout(retryTimer);
      void pull();
    } else {
      void flush();
    }
  };
  window.addEventListener("online", onOnline);

  void pull();
  return () => {
    disposed = true;
    unsub();
    window.removeEventListener("online", onOnline);
    if (timer) clearTimeout(timer);
    if (retryTimer) clearTimeout(retryTimer);
    flushActive = null;
  };
}

/* ---------- store ---------- */

const storedAgent = readPref(AGENT_KEY);

export const useAgent = create<AgentState>()((set, get) => ({
  status: "idle",
  chats: [],
  projects: [],
  activeChatId: null,
  runningChatId: null,
  models: perAgent(() => []),
  commands: perAgent(() => []),
  currentModel: perAgent(() => null),
  // Fresh installs start on the built-in agent; setup moves the default
  // to whichever agent gets connected (agent-setup.ts autoPickDefault).
  defaultAgent: isAgentKind(storedAgent) ? storedAgent : "cotenk",
  defaultModels: perAgent((a) => readPref(modelKey(a)) ?? ""),
  thought: null,
  usage: null,
  error: null,
  errorAgent: null,
  hydrated: false,

  refresh: async (agent) => {
    const st = get();
    const kind =
      agent ??
      st.chats.find((c) => c.id === st.activeChatId)?.agent ??
      st.defaultAgent;
    try {
      const d = await acpClient(kind).bootstrap();
      set((s) => ({
        models: d.models.length
          ? { ...s.models, [kind]: d.models }
          : s.models,
        currentModel: d.currentModel
          ? { ...s.currentModel, [kind]: d.currentModel }
          : s.currentModel,
        ...(!d.ok ? { error: d.lastError ?? s.error, errorAgent: kind } : {}),
        // A healthy boot clears this agent's stale error.
        ...(d.ok && s.errorAgent === kind && s.status !== "running"
          ? { error: null, errorAgent: null }
          : {}),
        status:
          s.status === "running"
            ? s.status
            : d.ok
              ? "ready"
              : s.status === "idle"
                ? "idle"
                : s.status,
        chats:
          Object.keys(d.sessions).length > 0
            ? s.chats.map((c) =>
                c.agent === kind &&
                d.sessions[c.id] &&
                d.sessions[c.id] !== c.acpSessionId
                  ? { ...c, acpSessionId: d.sessions[c.id] }
                  : c,
              )
            : s.chats,
      }));
    } catch {
      /* agent backend unreachable — keep current status */
    }
  },

  send: async (text, opts) => {
    const images = opts?.images ?? [];
    const shown = text.trim();
    const prompt = shown || (images.length > 0 ? "See the attached image(s)." : "");
    const st = get();
    if (!prompt || st.status === "running") return;

    let chat = st.chats.find((c) => c.id === st.activeChatId) ?? null;
    if (!chat) {
      get().newChat();
      chat = get().chats.find((c) => c.id === get().activeChatId)!;
    }
    const chatId = chat.id;
    const agent = chat.agent;
    // An agent's own slash command (/review …) must reach it as typed —
    // nothing in front — so the workspace preamble waits for the first
    // ordinary message.
    const isCommand = (t: string) => isAgentCommand(t, st.commands[agent]);
    const command = isCommand(prompt);
    const firstTurn =
      !command &&
      !chat.messages.some((m) => m.role === "user" && !isCommand(m.text));
    const now = Date.now();

    set((s) => ({
      status: "running",
      runningChatId: chatId,
      error: null,
      errorAgent: null,
      thought: null,
      usage: null,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title:
                c.title === "New chat" && c.messages.length === 0
                  ? (shown || "Image").slice(0, 48)
                  : c.title,
              updatedAt: now,
              messages: [
                ...c.messages,
                {
                  id: nextMsgId(),
                  role: "user",
                  text: shown,
                  ...(images.length > 0 ? { images: images.map((i) => i.ref) } : {}),
                },
              ],
            }
          : c,
      ),
    }));

    const patchChat = (fn: (c: AgentChat) => AgentChat) =>
      set((s) => ({
        chats: s.chats.map((c) => (c.id === chatId ? fn(c) : c)),
      }));
    const patchMsg = (id: string, fn: (m: AgentMsg) => AgentMsg) =>
      patchChat((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === id ? fn(m) : m)),
      }));
    const pushMsg = (m: AgentMsg) =>
      patchChat((c) => ({ ...c, messages: [...c.messages, m] }));

    // Text after a tool call starts a new bubble, so the transcript reads
    // in the order things happened. Tool updates edit their own row.
    let textMsgId: string | null = null;
    const toolRows = new Map<string, { msgId: string; title: string }>();

    running = { chatId, agent };
    setAgentRunning(true);
    let ok = false;
    try {
      let streamErr: string | null = null;
      // The first turn of every chat carries the workspace conventions,
      // so any ACP agent knows how CoTenk pages and embeds are shaped.
      const wire = (
        command
          ? [prompt]
          : [
              firstTurn ? workspacePreamble(agent) : null,
              opts?.context?.trim() || null,
              prompt,
            ]
      )
        .filter(Boolean)
        .join("\n\n");
      const wireImages = await Promise.all(
        images.map(async (i) => ({
          data: await blobToBase64(i.blob),
          mimeType: i.blob.type || "image/webp",
        })),
      );
      await acpClient(agent).prompt(
        chatId,
        wire,
        chat.model || undefined,
        (ev: AgentEvent) => {
          if (ev.type === "text") {
            if (textMsgId) {
              const id = textMsgId;
              patchMsg(id, (m) => ({ ...m, text: m.text + ev.text }));
            } else {
              textMsgId = nextMsgId();
              pushMsg({
                id: textMsgId,
                role: "agent",
                text: ev.text,
                streaming: true,
              });
            }
            set({ thought: null });
          } else if (ev.type === "thought") {
            set((s) => ({ thought: (s.thought ?? "") + ev.text }));
          } else if (ev.type === "tool") {
            const known = ev.id ? toolRows.get(ev.id) : undefined;
            if (known) {
              if (ev.title) known.title = ev.title;
              patchMsg(known.msgId, (m) => ({
                ...m,
                text: known.title,
                status: ev.status,
              }));
            } else {
              const msgId = nextMsgId();
              const title = ev.title ?? "Tool call";
              if (ev.id) toolRows.set(ev.id, { msgId, title });
              pushMsg({ id: msgId, role: "tool", text: title, status: ev.status });
            }
            textMsgId = null;
            set({ thought: null });
          } else if (ev.type === "usage") {
            set({ usage: { used: ev.used, size: ev.size } });
          } else if (ev.type === "error") {
            streamErr = ev.message;
          }
        },
        wireImages,
      );
      if (streamErr) throw new Error(streamErr);
      ok = true;
      set({ status: "ready", thought: null });
    } catch (e) {
      set({
        status: "error",
        thought: null,
        error: e instanceof Error ? e.message : String(e),
        errorAgent: agent,
      });
    } finally {
      running = null;
      setAgentRunning(false);
      track("agent_turn_completed", { agent, ok, first_turn: firstTurn });
      patchChat((c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m,
        ),
      }));
      set({ runningChatId: null });
    }
    void get().refresh(agent);
  },

  stop: () => {
    if (running) acpClient(running.agent).cancel(running.chatId);
  },

  newChat: (projectId = null, agent) => {
    const id = uid();
    set((s) => {
      const kind = agent ?? s.defaultAgent;
      return {
        chats: [
          {
            id,
            projectId,
            agent: kind,
            title: "New chat",
            model: s.defaultModels[kind],
            pinned: false,
            messages: [],
            acpSessionId: null,
            updatedAt: Date.now(),
          },
          ...s.chats,
        ],
        activeChatId: id,
        thought: null,
        error: null,
        errorAgent: null,
      };
    });
  },

  selectChat: (id) => set({ activeChatId: id }),
  closeChat: () => set({ activeChatId: null }),

  renameChat: (id, title) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
      ),
    })),

  deleteChat: (id) =>
    set((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      return {
        chats,
        activeChatId:
          s.activeChatId === id
            ? (chats[0]?.id ?? null)
            : s.activeChatId,
      };
    }),

  togglePinChat: (id) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c,
      ),
    })),

  setChatModel: (id, model) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, model } : c)),
    })),

  setChatAgent: (id, agent) => {
    get().setDefaultAgent(agent);
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === id && c.messages.length === 0
          ? { ...c, agent, model: s.defaultModels[agent] }
          : c,
      ),
    }));
  },

  setDefaultAgent: (agent) => {
    writePref(AGENT_KEY, agent);
    set({ defaultAgent: agent });
  },

  setDefaultModel: (agent, model) => {
    writePref(modelKey(agent), model);
    set((s) => ({ defaultModels: { ...s.defaultModels, [agent]: model } }));
  },

  assignChat: (id, projectId) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === id ? { ...c, projectId, updatedAt: Date.now() } : c,
      ),
    })),

  createProject: (name) =>
    set((s) => ({
      projects: [...s.projects, { id: uid(), name }],
    })),

  renameProject: (id, name) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
    })),

  deleteProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      // Chats are not deleted — they become unfiled.
      chats: s.chats.map((c) =>
        c.projectId === id ? { ...c, projectId: null } : c,
      ),
    })),
}));

export const useActiveChat = () =>
  useAgent(
    (s) => s.chats.find((c) => c.id === s.activeChatId) ?? null,
  );

/** True when `text` starts with one of the agent's own slash commands. */
export function isAgentCommand(text: string, commands: AgentCommand[]): boolean {
  const m = /^\/([^\s/]+)/.exec(text.trim());
  return !!m && commands.some((c) => c.name === m[1]);
}

onAgentCommands((kind, cmds) =>
  useAgent.setState((s) => ({ commands: { ...s.commands, [kind]: cmds } })),
);
