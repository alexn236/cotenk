import type { AgentCommand } from "./agent/acp-client";
import type { AgentKind } from "./agents";
import {
  BUILTIN_SKILL,
  extensionSlug,
  type Extension,
} from "./extensions";

/**
 * "/" in the agent composer: the agent's own commands (/review, /mcp …)
 * plus CoTenk's skills, MCP servers and plugins. Commands go to the agent
 * as typed; a skill / server / plugin token stays in the message and adds
 * a line to the turn's context telling the agent to use it.
 */

export type SlashRef = {
  kind: "skill" | "mcp" | "plugin";
  /** Token after the slash. */
  name: string;
  description: string;
  /** Plugins: what's inside. */
  parts?: string;
};

const BUILTIN_SKILL_REF: SlashRef = {
  kind: "skill",
  name: BUILTIN_SKILL,
  description: "How CoTenk pages, tasks and embeds work",
};

/** Enabled extensions as slash tokens, built-in skill first. */
export function slashRefs(extensions: Extension[]): SlashRef[] {
  const refs: SlashRef[] = [BUILTIN_SKILL_REF];
  for (const e of extensions) {
    if (!e.enabled) continue;
    if (e.kind === "skill") {
      refs.push({ kind: "skill", name: e.name, description: e.description });
    } else if (e.kind === "mcp") {
      refs.push({
        kind: "mcp",
        name: e.name,
        description:
          e.transport === "http" ? e.url : [e.command, ...e.args].join(" "),
      });
    } else {
      const parts = [
        e.skills.length
          ? `${e.skills.length} ${e.skills.length === 1 ? "skill" : "skills"}`
          : null,
        e.servers.length
          ? `${e.servers.length} MCP ${e.servers.length === 1 ? "server" : "servers"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      refs.push({
        kind: "plugin",
        name: extensionSlug(e.name),
        description: e.description || parts,
        parts,
      });
    }
  }
  return refs;
}

export type { AgentCommand };

/**
 * Context for the turn: which extensions the message points at with
 * /name, and how this agent reaches them. Null when there are none.
 */
export function slashContext(
  text: string,
  extensions: Extension[],
  agent: AgentKind,
): string | null {
  const refs = slashRefs(extensions);
  const lines: string[] = [];
  const seen = new Set<string>();
  // Claude Code gets CoTenk's skills as the session plugin "cotenk".
  const skillName = (n: string) => (agent === "claude" ? `cotenk:${n}` : n);
  for (const m of text.matchAll(/(^|\s)\/([a-z0-9][a-z0-9:._-]*)/gi)) {
    const token = m[2].toLowerCase();
    if (seen.has(token)) continue;
    const ref = refs.find((r) => r.name === token);
    if (!ref) continue;
    seen.add(token);
    if (ref.kind === "skill") {
      lines.push(
        `- skill "${skillName(ref.name)}"${ref.description ? ` (${ref.description})` : ""}: load it and follow its instructions for this request.`,
      );
    } else if (ref.kind === "mcp") {
      lines.push(`- MCP server "${ref.name}": use its tools for this request.`);
    } else {
      const plugin = extensions.find(
        (e) => e.kind === "plugin" && extensionSlug(e.name) === ref.name,
      );
      if (plugin?.kind !== "plugin") continue;
      const scoped = (n: string) => extensionSlug(`${plugin.name}-${n}`);
      const skills = plugin.skills.map((s) => `"${skillName(scoped(s.name))}"`);
      const servers = plugin.servers.map((s) => `"${scoped(s.name)}"`);
      lines.push(
        `- plugin "${plugin.name}": use its ${[
          skills.length ? `skills ${skills.join(", ")}` : null,
          servers.length ? `MCP servers ${servers.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" and ")} for this request.`,
      );
    }
  }
  return lines.length
    ? `The user pointed you at these CoTenk extensions (/name in the message):\n${lines.join("\n")}`
    : null;
}
