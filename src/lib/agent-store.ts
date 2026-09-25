import { create } from "zustand";
import { getSupabase } from "./supabase";
import { devinAcp, type AgentEvent } from "./agent/acp-client";
import type { ModelOption } from "./agent-models";
import { WORKSPACE_PREAMBLE } from "./agent-context";

export type AgentRole = "user" | "agent" | "tool";

export type AgentMsg = {
  id: string;
  role: AgentRole;
  text: string;
  /** Live-updating row while a turn runs. */
  streaming?: boolean;
};

export type AgentChat = {
  id: string;
  projectId: string | null;
  title: string;
  /** Model id, "" = account default. */
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

type AgentState = {
  status: AgentStatus;
  chats: AgentChat[];
  projects: AgentProject[];
  activeChatId: string | null;
  models: ModelOption[];
  /** Account default model value reported by ACP ("" → this). */
  currentModel: string | null;
  /** Model for the next chat when none is active. */
  defaultModel: string;
  /** Latest streamed thought — status line while running. */
  thought: string | null;
  /** Context usage of the last turn (tokens used / window size). */
  usage: { used: number; size: number } | null;
  error: string | null;
  hydrated: boolean;

  refresh: () => Promise<void>;
  /**
   * Sends a turn. `context` is prepended to what the agent receives but
   * not shown in the transcript (page paths, task details, …).
   */
  send: (text: string, opts?: { context?: string }) => Promise<void>;
  stop: () => void;

  newChat: (projectId?: string | null) => void;
  selectChat: (id: string) => void;
  closeChat: () => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  togglePinChat: (id: string) => void;
  setChatModel: (id: string, model: string) => void;
  setDefaultModel: (model: string) => void;
  assignChat: (id: string, projectId: string | null) => void;

  createProject: (name: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
};

let msgCounter = 0;
const nextMsgId = () => `m${Date.now().toString(36)}-${msgCounter++}`;

let idCounter = 0;
const uid = () =>
  `a-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

let activeChatKey: string | null = null;

/* ---------- supabase persistence ---------- */

let persistUserId: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistBusy = false;
let persistDirty = false;

type ChatRow = {
  id: string;
  project_id: string | null;
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
  title: r.title,
  model: r.model ?? "",
  pinned: r.pinned,
  messages: Array.isArray(r.messages)
    ? r.messages.map((m) => ({ ...m, streaming: false }))
    : [],
  acpSessionId: r.acp_session_id ?? null,
  updatedAt: Number(r.updated_at) || Date.now(),
});

async function flushAgentData() {
  if (persistBusy || !persistUserId) {
    persistDirty = true;
    return;
  }
  persistBusy = true;
  persistDirty = false;
  try {
    const sb = getSupabase();
    const { chats, projects } = useAgent.getState();
    if (projects.length > 0) {
      await sb.from("agent_projects").upsert(
        projects.map((p) => ({
          id: p.id,
          user_id: persistUserId,
          name: p.name,
        })),
      );
    }
    const { data: rp } = await sb.from("agent_projects").select("id");
    const keep = new Set(projects.map((p) => p.id));
    const stale = (rp ?? [])
      .map((r) => r.id as string)
      .filter((id) => !keep.has(id));
    if (stale.length > 0) {
      await sb.from("agent_projects").delete().in("id", stale);
    }

    if (chats.length > 0) {
      await sb.from("agent_chats").upsert(
        chats.map((c) => ({
          id: c.id,
          user_id: persistUserId,
          project_id: c.projectId,
          title: c.title,
          model: c.model,
          pinned: c.pinned,
          messages: c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
          })),
          acp_session_id: c.acpSessionId,
          updated_at: c.updatedAt,
        })),
      );
    }
    const { data: rc } = await sb.from("agent_chats").select("id");
    const keepC = new Set(chats.map((c) => c.id));
    const staleC = (rc ?? [])
      .map((r) => r.id as string)
      .filter((id) => !keepC.has(id));
    if (staleC.length > 0) {
      await sb.from("agent_chats").delete().in("id", staleC);
    }
  } catch {
    /* tables may not exist yet — local state still works */
  } finally {
    persistBusy = false;
    if (persistDirty) schedulePersist();
  }
}

function schedulePersist() {
  if (!persistUserId) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void flushAgentData(), 800);
}

/** Pull chats/projects once per sign-in, then push changes debounced. */
export function initAgentSync(userId: string): () => void {
  persistUserId = userId;
  let disposed = false;

  const pull = async () => {
    const sb = getSupabase();
    const [p, c] = await Promise.all([
      sb.from("agent_projects").select("id, name").order("created_at"),
      sb
        .from("agent_chats")
        .select(
          "id, project_id, title, model, pinned, messages, acp_session_id, updated_at",
        )
        .order("updated_at", { ascending: false }),
    ]);
    if (disposed) return;
    if (!p.error && !c.error) {
      // Pause persistence so hydrating doesn't echo rows back.
      persistUserId = null;
      useAgent.setState({
        projects: (p.data ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
        })),
        chats: ((c.data ?? []) as unknown as ChatRow[]).map(toChat),
        activeChatId: (c.data?.[0]?.id as string | undefined) ?? null,
        hydrated: true,
      });
      persistUserId = userId;
    } else {
      // Tables missing yet (migration pending) — work in-memory.
      useAgent.setState({ hydrated: true });
    }
  };

  const unsub = useAgent.subscribe((s, prev) => {
    if (s.chats !== prev.chats || s.projects !== prev.projects) {
      schedulePersist();
    }
  });

  void pull();
  return () => {
    disposed = true;
    unsub();
    persistUserId = null;
    if (persistTimer) clearTimeout(persistTimer);
  };
}

/* ---------- store ---------- */

export const useAgent = create<AgentState>()((set, get) => ({
  status: "idle",
  chats: [],
  projects: [],
  activeChatId: null,
  models: [],
  currentModel: null,
  defaultModel:
    typeof window === "undefined"
      ? ""
      : (localStorage.getItem("cotenk-default-model") ?? ""),
  thought: null,
  usage: null,
  error: null,
  hydrated: false,

  refresh: async () => {
    try {
      const d = await devinAcp.bootstrap();
      set((s) => ({
        models: d.models.length ? d.models : s.models,
        currentModel: d.currentModel ?? s.currentModel,
        error: !d.ok ? (d.lastError ?? s.error) : s.error,
        status:
          s.status === "running"
            ? s.status
            : d.busy
              ? "running"
              : d.ok
                ? "ready"
                : s.status === "idle"
                  ? "idle"
                  : s.status,
        chats:
          Object.keys(d.sessions).length > 0
            ? s.chats.map((c) =>
                d.sessions[c.id] && d.sessions[c.id] !== c.acpSessionId
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
    const prompt = text.trim();
    const st = get();
    if (!prompt || st.status === "running") return;

    let chat = st.chats.find((c) => c.id === st.activeChatId) ?? null;
    if (!chat) {
      get().newChat();
      chat = get().chats.find((c) => c.id === get().activeChatId)!;
    }
    const chatId = chat.id;
    const firstTurn = chat.messages.length === 0;
    const agentMsgId = nextMsgId();
    const now = Date.now();

    set((s) => ({
      status: "running",
      error: null,
      thought: null,
      usage: null,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title:
                c.title === "New chat" && c.messages.length === 0
                  ? prompt.slice(0, 48)
                  : c.title,
              updatedAt: now,
              messages: [
                ...c.messages,
                { id: nextMsgId(), role: "user", text: prompt },
                {
                  id: agentMsgId,
                  role: "agent",
                  text: "",
                  streaming: true,
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
    const patchMsg = (fn: (m: AgentMsg) => AgentMsg) =>
      patchChat((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === agentMsgId ? fn(m) : m)),
      }));
    const pushMsg = (role: AgentRole, t: string) =>
      patchChat((c) => ({
        ...c,
        messages: [...c.messages, { id: nextMsgId(), role, text: t }],
      }));

    activeChatKey = chatId;
    try {
      let streamErr: string | null = null;
      // The first turn of every chat carries the workspace conventions,
      // so any ACP agent knows how CoTenk pages and embeds are shaped.
      const wire = [
        firstTurn ? WORKSPACE_PREAMBLE : null,
        opts?.context?.trim() || null,
        prompt,
      ]
        .filter(Boolean)
        .join("\n\n");
      await devinAcp.prompt(
        chatId,
        wire,
        chat.model || undefined,
        (ev: AgentEvent) => {
          if (ev.type === "text") {
            patchMsg((m) => ({ ...m, text: m.text + ev.text }));
          } else if (ev.type === "thought") {
            set((s) => ({ thought: (s.thought ?? "") + ev.text }));
          } else if (ev.type === "tool") {
            pushMsg(
              "tool",
              `${ev.title}${ev.status ? ` · ${ev.status}` : ""}`,
            );
          } else if (ev.type === "usage") {
            set({ usage: { used: ev.used, size: ev.size } });
          } else if (ev.type === "error") {
            streamErr = ev.message;
          }
        },
      );
      if (streamErr) throw new Error(streamErr);
      patchMsg((m) => ({ ...m, streaming: false }));
      patchChat((c) => ({ ...c, updatedAt: Date.now() }));
      set({ status: "ready", thought: null });
    } catch (e) {
      patchMsg((m) => ({
        ...m,
        streaming: false,
        text: m.text || "_(failed)_",
      }));
      set({
        status: "error",
        thought: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      activeChatKey = null;
    }
    void get().refresh();
  },

  stop: () => {
    if (activeChatKey) devinAcp.cancel(activeChatKey);
  },

  newChat: (projectId = null) => {
    const id = uid();
    set((s) => ({
      chats: [
        {
          id,
          projectId,
          title: "New chat",
          model: s.defaultModel,
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
    }));
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

  setDefaultModel: (model) => {
    try {
      localStorage.setItem("cotenk-default-model", model);
    } catch {
      /* private mode */
    }
    set({ defaultModel: model });
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
