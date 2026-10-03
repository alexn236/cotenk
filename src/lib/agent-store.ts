import { create } from "zustand";
import {
  acpClient,
  onAgentCommands,
  type AgentCommand,
  type AgentEvent,
} from "./agent/acp-client";
import type { ModelOption } from "./agent-models";
import { workspacePreamble } from "./agent-context";
import { AGENT_KINDS, isAgentKind, type AgentKind } from "./agents";
import { setAgentRunning } from "./activity";
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

/* ---------- local persistence ---------- */

/** Chats and projects live on this device (localStorage). */
const CHATS_KEY = "cotenk-agent-chats";

type StoredChats = { chats: AgentChat[]; projects: AgentProject[] };

function loadChats(): StoredChats {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<StoredChats>) : null;
    const chats = Array.isArray(v?.chats) ? v.chats : [];
    return {
      chats: chats
        .filter((c) => c && typeof c.id === "string" && isAgentKind(c.agent))
        .map((c) => ({
          ...c,
          messages: Array.isArray(c.messages)
            ? c.messages.map((m) => ({ ...m, streaming: false }))
            : [],
        })),
      projects: Array.isArray(v?.projects) ? v.projects : [],
    };
  } catch {
    return { chats: [], projects: [] };
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveChats() {
  saveTimer = null;
  const { chats, projects } = useAgent.getState();
  const slim = chats.map((c) => ({
    ...c,
    messages: c.messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      ...(m.status ? { status: m.status } : {}),
      ...(m.images?.length ? { images: m.images } : {}),
    })),
  }));
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify({ chats: slim, projects }));
  } catch {
    /* storage unavailable or full */
  }
}

/* ---------- store ---------- */

const storedAgent = readPref(AGENT_KEY);
const stored = typeof window !== "undefined" ? loadChats() : { chats: [], projects: [] };

export const useAgent = create<AgentState>()((set, get) => ({
  status: "idle",
  chats: stored.chats,
  projects: stored.projects,
  activeChatId: stored.chats[0]?.id ?? null,
  runningChatId: null,
  models: perAgent(() => []),
  commands: perAgent(() => []),
  currentModel: perAgent(() => null),
  // Fresh installs start on Claude Code; setup moves the default to
  // whichever agent gets connected (agent-setup.ts autoPickDefault).
  defaultAgent: isAgentKind(storedAgent) ? storedAgent : "claude",
  defaultModels: perAgent((a) => readPref(modelKey(a)) ?? ""),
  thought: null,
  usage: null,
  error: null,
  errorAgent: null,
  hydrated: true,

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

// Debounced: a streaming turn changes the chat many times a second.
useAgent.subscribe((s, prev) => {
  if (s.chats === prev.chats && s.projects === prev.projects) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveChats, 600);
});

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveChats();
    }
  });
}
