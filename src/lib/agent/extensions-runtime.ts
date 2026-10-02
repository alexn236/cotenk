import { invoke } from "@tauri-apps/api/core";
import workspaceSkill from "./cotenk-skill.md?raw";
import type { AgentKind } from "../agents";
import { cotenkAgentEnv } from "../cotenk-agent";
import { newId } from "../ids";
import {
  BUILTIN_MCP,
  BUILTIN_SKILL,
  expandExtensions,
  extensionSecrets,
  skillFile,
  useExtensions,
  type McpExtension,
} from "../extensions";

/**
 * Hands the enabled extensions (Settings → Skills & MCP) to the agents
 * without touching their own configuration:
 *
 *  - Claude Code gets everything per ACP session: skills as a session
 *    plugin (`_meta.claudeCode.options.plugins` → `cotenk:<name>`), MCP
 *    servers in `mcpServers`.
 *  - The CoTenk Agent (OpenCode) reads the same skills folder through
 *    `skills.paths` in its environment config and takes MCP servers in
 *    `session/new` like Claude Code.
 *  - Devin CLI ignores `mcpServers` from `session/new`, so the workspace's
 *    `.devin/mcp_config.local.json` lists one server, the CoTenk gateway
 *    (`cotenk --mcp-gateway`, src-tauri/src/mcp_gateway.rs). It serves
 *    skills and proxies the MCP servers — but only to Devin processes
 *    CoTenk started with this run's token. Plain `devin` gets no tools.
 *
 * Skills and the gateway config live in CoTenk's app-data folder. The
 * workspace guide (cotenk-skill.md) ships as the built-in skill.
 */

type Paths = { dir: string; exe: string };
type EnvPair = { name: string; value: string };
type AcpMcpServer =
  | { name: string; command: string; args: string[]; env: EnvPair[] }
  | { type: "http"; name: string; url: string; headers: EnvPair[] };

export type SessionExtensions = {
  mcpServers: AcpMcpServer[];
  _meta?: Record<string, unknown>;
};

/** Proves to the gateway that a Devin process was started by this run. */
const GATEWAY_TOKEN = newId();
const GATEWAY_TOKEN_ENV = "COTENK_GATEWAY_TOKEN";

let paths: Promise<Paths> | null = null;
const getPaths = () =>
  (paths ??= invoke<Paths>("extensions_paths").catch((e) => {
    paths = null;
    throw e;
  }));

const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/**
 * npm shims (npx, uvx, …) are .cmd files on Windows, which neither agent
 * nor the gateway can start directly — run anything that isn't an .exe
 * through cmd.
 */
function launch(command: string, args: string[]) {
  if (isWindows && !/\.exe$/i.test(command)) {
    return { command: "cmd", args: ["/c", command, ...args] };
  }
  return { command, args };
}

const trimDir = (p: string) => p.replace(/[\\/]+$/, "");
const pluginDir = (dir: string) => `${dir}/cotenk`;
const skillsDir = (dir: string) => `${pluginDir(dir)}/skills`;
const gatewayConfig = (dir: string) => `${dir}/devin-gateway.json`;

/** Last written content per file, to skip identical rewrites. */
const written = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

/** Serialized, so two agents starting at once don't interleave writes. */
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

async function writeOnce(path: string, contents: string) {
  if (written.get(path) === contents) return;
  await invoke("fs_write", { path, contents });
  written.set(path, contents);
}

/** The enabled skills (plus the workspace guide) as a Claude Code plugin. */
async function writeSkills(dir: string) {
  const seen = new Set([BUILTIN_SKILL]);
  const files = [{ name: BUILTIN_SKILL, text: workspaceSkill }];
  for (const e of expandExtensions(useExtensions.getState().items)) {
    if (e.kind !== "skill" || !e.enabled || seen.has(e.name)) continue;
    seen.add(e.name);
    files.push({ name: e.name, text: skillFile(e) });
  }
  const key = JSON.stringify(files);
  if (written.get(skillsDir(dir)) === key) return;
  await invoke("fs_remove", { path: skillsDir(dir) });
  await writeOnce(
    `${pluginDir(dir)}/.claude-plugin/plugin.json`,
    JSON.stringify(
      {
        name: "cotenk",
        version: "1.0.0",
        description: "Skills for agents working inside CoTenk",
      },
      null,
      2,
    ),
  );
  for (const f of files) {
    await invoke("fs_write", {
      path: `${skillsDir(dir)}/${f.name}/SKILL.md`,
      contents: f.text,
    });
  }
  written.set(skillsDir(dir), key);
}

function enabledServers(): McpExtension[] {
  const used = new Set([BUILTIN_MCP]);
  return expandExtensions(useExtensions.getState().items).filter((e): e is McpExtension => {
    if (e.kind !== "mcp" || !e.enabled || used.has(e.name)) return false;
    const ok =
      e.transport === "stdio"
        ? !!e.command.trim()
        : /^https?:\/\//i.test(e.url.trim());
    if (ok) used.add(e.name);
    return ok;
  });
}

function secretPairs(e: McpExtension): EnvPair[] {
  const secrets = extensionSecrets(e.id);
  return e.secretKeys
    .filter((k) => secrets[k])
    .map((k) => ({ name: k, value: secrets[k] }));
}

/** Claude Code and the CoTenk Agent: servers straight into `session/new`. */
function sessionServers(): AcpMcpServer[] {
  return enabledServers().map((e) =>
    e.transport === "stdio"
      ? { name: e.name, ...launch(e.command.trim(), e.args), env: secretPairs(e) }
      : { type: "http", name: e.name, url: e.url.trim(), headers: secretPairs(e) },
  );
}

/** Devin CLI: stdio specs for the gateway; URL servers via mcp-remote. */
function gatewayServers() {
  return enabledServers().map((e) => {
    const pairs = secretPairs(e);
    if (e.transport === "stdio") {
      return {
        name: e.name,
        ...launch(e.command.trim(), e.args),
        env: Object.fromEntries(pairs.map((p) => [p.name, p.value])),
      };
    }
    // Header values travel as env vars (mcp-remote expands ${VAR}), so
    // tokens never appear on a command line.
    const args = [
      "-y",
      "mcp-remote",
      e.url.trim(),
      ...pairs.flatMap((p, i) => ["--header", `${p.name}:\${COTENK_HEADER_${i}}`]),
    ];
    return {
      name: e.name,
      ...launch("npx", args),
      env: Object.fromEntries(pairs.map((p, i) => [`COTENK_HEADER_${i}`, p.value])),
    };
  });
}

async function writeGatewayConfig(dir: string) {
  await writeOnce(
    gatewayConfig(dir),
    JSON.stringify(
      { token: GATEWAY_TOKEN, skillsDir: skillsDir(dir), servers: gatewayServers() },
      null,
      2,
    ),
  );
}

/**
 * Registers the gateway in `<workspace>/.devin/mcp_config.local.json`
 * (Devin's "local, not committed" scope), keeping any other entries.
 */
async function registerGateway(root: string, { dir, exe }: Paths) {
  const path = `${trimDir(root)}/.devin/mcp_config.local.json`;
  const current = await invoke<string>("fs_read", { path }).catch(() => "");
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (current.trim()) {
    try {
      config = JSON.parse(current) as typeof config;
    } catch {
      return; // someone else's file we can't parse — leave it alone
    }
  }
  config.mcpServers = {
    ...config.mcpServers,
    [BUILTIN_MCP]: { command: exe, args: ["--mcp-gateway", gatewayConfig(dir)] },
  };
  await writeOnce(path, `${JSON.stringify(config, null, 2)}\n`);
}

let devinRoot: string | null = null;

export const NO_KEY_MESSAGE =
  "The CoTenk Agent needs an API key — add one in Settings → Agents.";

/**
 * Before an agent process starts in `root`: files in place, plus the
 * environment it is spawned with.
 */
export function prepareAgent(
  kind: AgentKind,
  root: string,
): Promise<Record<string, string>> {
  return serialized(async (): Promise<Record<string, string>> => {
    await removeLegacyWorkspaceSkill(root);
    const p = await getPaths();
    await writeSkills(p.dir);
    if (kind === "cotenk") {
      const env = cotenkAgentEnv(skillsDir(p.dir));
      if (!env) throw new Error(NO_KEY_MESSAGE);
      return env;
    }
    if (kind !== "devin") return {};
    await writeGatewayConfig(p.dir);
    await registerGateway(root, p);
    devinRoot = root;
    return { [GATEWAY_TOKEN_ENV]: GATEWAY_TOKEN };
  });
}

/** `session/new` params for `kind`; Devin's come through the gateway. */
export async function sessionExtensions(
  kind: AgentKind,
): Promise<SessionExtensions> {
  if (kind === "devin") return { mcpServers: [] };
  if (kind === "cotenk") return { mcpServers: sessionServers() };
  const { dir } = await getPaths();
  await serialized(() => writeSkills(dir));
  return {
    mcpServers: sessionServers(),
    _meta: {
      claudeCode: {
        options: { plugins: [{ type: "local", path: pluginDir(dir) }] },
      },
    },
  };
}

// The gateway re-reads its files on every request, so a running Devin
// picks up edits right away. Claude gets them with its next session,
// the CoTenk Agent its MCP servers too (skills when it restarts).
let refresh: ReturnType<typeof setTimeout> | null = null;
useExtensions.subscribe((s, prev) => {
  if (s.items === prev.items || !paths) return;
  if (refresh) clearTimeout(refresh);
  refresh = setTimeout(() => {
    void serialized(async () => {
      const p = await getPaths();
      await writeSkills(p.dir);
      if (devinRoot) await writeGatewayConfig(p.dir);
    }).catch(() => {});
  }, 300);
});

const cleaned = new Set<string>();

/**
 * Older versions copied the guide into the workspace as a project skill,
 * where plain `claude` runs picked it up too. Remove that copy.
 */
async function removeLegacyWorkspaceSkill(root: string) {
  if (cleaned.has(root)) return;
  cleaned.add(root);
  await invoke("fs_remove", {
    path: `${trimDir(root)}/.claude/skills/${BUILTIN_SKILL}`,
  }).catch(() => {});
}
