import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { acpClient } from "./agent/acp-client";
import { hasAgentPreference, useAgent } from "./agent-store";
import { AGENT_KINDS, type AgentKind } from "./agents";
import { apiKeyOverride, devinStatus, isDesktop } from "./workspace";

/**
 * Connection state per local agent (installed? signed in?) — shared by
 * Settings → Agents, the chat empty state and the agent picker, so every
 * surface tells the same story and offers the same "Connect" action.
 */

export type AgentSetup = {
  /** The agent can be started from here. */
  installed: boolean;
  /** Signed in (or an API key is configured). */
  authed: boolean;
  /** Short state line, e.g. "2.1.282 · signed in". */
  detail: string;
  /** What to do next when not ready. */
  hint: string | null;
};

type ClaudeStatus = {
  cli: string | null;
  authed: boolean;
  adapter: boolean;
  npx: boolean;
};

async function probe(kind: AgentKind): Promise<AgentSetup> {
  if (kind === "devin") {
    const s = await devinStatus();
    const authed = s.authed || !!apiKeyOverride();
    return {
      installed: s.binary,
      authed,
      detail: !s.binary
        ? "Not installed"
        : `${s.version ?? "installed"} · ${authed ? "signed in" : "not signed in"}`,
      hint: !s.binary
        ? "Install Devin CLI, then come back here."
        : authed
          ? null
          : "Sign in once — a browser window opens.",
    };
  }
  const s = await invoke<ClaudeStatus>("claude_status");
  const installed = !!s.cli && (s.adapter || s.npx);
  return {
    installed,
    authed: s.authed,
    detail: !s.cli
      ? "Not installed"
      : `${s.cli.replace(/\s*\(Claude Code\)/, "")} · ${
          s.authed ? "signed in" : "not signed in"
        }${s.adapter ? "" : " · adapter via npx"}`,
    hint: !s.cli
      ? "Install Claude Code: npm install -g @anthropic-ai/claude-code"
      : !s.adapter && !s.npx
        ? "Install the ACP adapter: npm install -g @agentclientprotocol/claude-agent-acp"
        : s.authed
          ? null
          : "Sign in once — a terminal opens with `claude auth login`.",
  };
}

type SetupState = {
  setup: Partial<Record<AgentKind, AgentSetup>>;
  connecting: AgentKind | null;
  check: (kind: AgentKind) => Promise<AgentSetup | null>;
  /** Runs the agent's sign-in flow and waits until it reports success. */
  connect: (kind: AgentKind) => Promise<boolean>;
};

const isReady = (s?: AgentSetup) => !!s && s.installed && s.authed;

/**
 * Until someone picks an agent, default to one that actually works —
 * a fresh install shouldn't open on an agent that isn't set up.
 */
function autoPickDefault(setup: Partial<Record<AgentKind, AgentSetup>>) {
  const agent = useAgent.getState();
  if (hasAgentPreference() || isReady(setup[agent.defaultAgent])) return;
  if (!setup[agent.defaultAgent]) return; // wait until it's probed
  const ready = AGENT_KINDS.find((k) => isReady(setup[k]));
  if (ready) agent.setDefaultAgent(ready);
}

/** Probes run CLIs (~1s); concurrent callers share one. */
const inflight = new Map<AgentKind, Promise<AgentSetup | null>>();

export const useAgentSetup = create<SetupState>()((set, get) => ({
  setup: {},
  connecting: null,

  check: (kind) => {
    if (!isDesktop()) return Promise.resolve(null);
    let p = inflight.get(kind);
    if (!p) {
      p = probe(kind)
        .then((s) => {
          set((st) => ({ setup: { ...st.setup, [kind]: s } }));
          autoPickDefault(get().setup);
          return s;
        })
        .catch(() => null)
        .finally(() => inflight.delete(kind));
      inflight.set(kind, p);
    }
    return p;
  },

  connect: async (kind) => {
    if (get().connecting) return false;
    set({ connecting: kind });
    try {
      await invoke(kind === "devin" ? "devin_login" : "claude_login");
      // Both CLIs finish sign-in in a browser; poll until it lands.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await get().check(kind);
        if (s?.authed) {
          await acpClient(kind).kill(); // re-auth on the next turn
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      set({ connecting: null });
    }
  },
}));
