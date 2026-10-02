/**
 * The local ACP agents CoTenk can host. Each runs as its own subprocess
 * in the workspace folder (see src-tauri); chats are bound to one agent.
 * "cotenk" is the built-in one — OpenCode with the person's own API key
 * (see cotenk-agent.ts); the others bring their own CLI login.
 */

export type AgentKind = "cotenk" | "devin" | "claude";

export type AgentInfo = {
  id: AgentKind;
  name: string;
  /** How people address it in tasks, e.g. "@claude". */
  handle: string;
  /** One line for pickers and empty states. */
  blurb: string;
};

export const AGENTS: Record<AgentKind, AgentInfo> = {
  cotenk: {
    id: "cotenk",
    name: "CoTenk Agent",
    handle: "cotenk",
    blurb: "Built in · bring your own API key (Anthropic, OpenAI, …)",
  },
  claude: {
    id: "claude",
    name: "Claude Code",
    handle: "claude",
    blurb: "Anthropic's coding agent · uses your Claude login",
  },
  devin: {
    id: "devin",
    name: "Devin CLI",
    handle: "devin",
    blurb: "Cognition's agent · native ACP",
  },
};

export const AGENT_KINDS: AgentKind[] = ["cotenk", "claude", "devin"];

export const isAgentKind = (v: unknown): v is AgentKind =>
  typeof v === "string" && (AGENT_KINDS as string[]).includes(v);

/** Agent a task owner like "@claude" refers to, if any. */
export function agentForHandle(name: string): AgentKind | null {
  const n = name.toLowerCase();
  return AGENT_KINDS.find((k) => AGENTS[k].handle === n) ?? null;
}
