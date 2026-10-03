import { create } from "zustand";
import { newId } from "./ids";

/**
 * Skills and MCP servers that exist only inside CoTenk. They are handed to
 * Claude Code / Devin CLI per ACP session (see agent/extensions-runtime.ts)
 * and never written to ~/.claude, ~/.config/devin or the workspace, so the
 * CLIs run outside CoTenk never see them.
 *
 * The list lives on this device. Secret values — env vars of a command
 * server, headers of a URL server — are kept apart from the list, so an
 * exported or shared list never carries them.
 */

export type SkillExtension = {
  kind: "skill";
  id: string;
  /** Lowercase slug, e.g. "release-notes". */
  name: string;
  /** When to use it — agents decide from this line alone. */
  description: string;
  /** Instructions (SKILL.md without frontmatter). */
  body: string;
  enabled: boolean;
  updatedAt: number;
};

export type McpExtension = {
  kind: "mcp";
  id: string;
  name: string;
  /** "stdio" starts a local command, "http" connects to a URL. */
  transport: "stdio" | "http";
  command: string;
  args: string[];
  url: string;
  /** Env var (stdio) or header (http) names; values live in secrets. */
  secretKeys: string[];
  enabled: boolean;
  updatedAt: number;
};

export type PluginSkill = Pick<SkillExtension, "name" | "description" | "body">;
export type PluginServer = Pick<
  McpExtension,
  "name" | "transport" | "command" | "args" | "url" | "secretKeys"
>;

/**
 * A bundle of skills and MCP servers added in one go (a Claude Code style
 * plugin folder). Agents see its parts as ordinary skills / servers named
 * `<plugin>-<part>` — see expandExtensions.
 */
export type PluginExtension = {
  kind: "plugin";
  id: string;
  name: string;
  description: string;
  skills: PluginSkill[];
  servers: PluginServer[];
  enabled: boolean;
  updatedAt: number;
};

export type Extension = SkillExtension | McpExtension | PluginExtension;

type Draft<T> = Omit<T, "id" | "updatedAt">;
export type ExtensionDraft =
  | Draft<SkillExtension>
  | Draft<McpExtension>
  | Draft<PluginExtension>;

export const pluginItemId = (pluginId: string, name: string) =>
  `${pluginId}:${name}`;

/** Plugins unpacked into the skills and servers agents actually get. */
export function expandExtensions(
  items: Extension[],
): (SkillExtension | McpExtension)[] {
  return items.flatMap((e) => {
    if (e.kind !== "plugin") return [e];
    const scoped = (n: string) => extensionSlug(`${e.name}-${n}`);
    const base = { enabled: e.enabled, updatedAt: e.updatedAt };
    return [
      ...e.skills.map((s) => ({
        ...s,
        ...base,
        kind: "skill" as const,
        id: pluginItemId(e.id, s.name),
        name: scoped(s.name),
      })),
      ...e.servers.map((s) => ({
        ...s,
        ...base,
        kind: "mcp" as const,
        id: pluginItemId(e.id, s.name),
        name: scoped(s.name),
      })),
    ];
  });
}

export type McpImport = { server: PluginServer; secrets: Record<string, string> };

/** Reads an `.mcp.json` (`{mcpServers:{…}}` or the bare map) into servers. */
export function parseMcpConfig(raw: unknown): McpImport[] {
  if (!raw || typeof raw !== "object") return [];
  const top = raw as Record<string, unknown>;
  const map =
    top.mcpServers && typeof top.mcpServers === "object" ? top.mcpServers : top;
  const out: McpImport[] = [];
  for (const [key, v] of Object.entries(map as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    const name = extensionSlug(key);
    const command = typeof c.command === "string" ? c.command.trim() : "";
    const url = typeof c.url === "string" ? c.url.trim() : "";
    const http = !command && /^https?:\/\//i.test(url);
    if (!name || (!command && !http)) continue;
    const keyOk = http ? /^[A-Za-z0-9-]+$/ : /^[A-Za-z_][A-Za-z0-9_]*$/;
    const pairs = http ? c.headers : c.env;
    const secrets: Record<string, string> = {};
    if (pairs && typeof pairs === "object") {
      for (const [k, val] of Object.entries(pairs as Record<string, unknown>)) {
        if (keyOk.test(k) && typeof val === "string") secrets[k] = val;
      }
    }
    out.push({
      server: {
        name,
        transport: http ? "http" : "stdio",
        command: http ? "" : command,
        args:
          !http && Array.isArray(c.args)
            ? c.args.filter((a): a is string => typeof a === "string")
            : [],
        url: http ? url : "",
        secretKeys: Object.keys(secrets),
      },
      secrets,
    });
  }
  return out;
}

/** Names taken by CoTenk's own skill and Devin's gateway server. */
export const BUILTIN_SKILL = "cotenk-workspace";
export const BUILTIN_MCP = "cotenk";

/* ---------- helpers ---------- */

/** Skill/server names: lowercase letters, digits and hyphens (≤ 64). */
export function extensionSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** Splits a command line; double/single quotes keep spaces together. */
export function splitCommandLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const c of line) {
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

export function joinCommandLine(parts: string[]): string {
  return parts
    .map((p) => (p === "" || /\s/.test(p) ? `"${p}"` : p))
    .join(" ");
}

/** SKILL.md text: frontmatter (name, description) + body. */
export function skillFile(s: Pick<SkillExtension, "name" | "description" | "body">) {
  // JSON strings are valid YAML scalars — safe for colons and quotes.
  return `---\nname: ${s.name}\ndescription: ${JSON.stringify(
    s.description.replace(/\s+/g, " ").trim(),
  )}\n---\n\n${s.body.trim()}\n`;
}

/** Reads an imported SKILL.md (or any .md) into skill fields. */
export function parseSkillFile(
  text: string,
  fallbackName: string,
): Pick<SkillExtension, "name" | "description" | "body"> {
  const src = text.trimStart().replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  const fields: Record<string, string> = {};
  if (m) {
    const lines = m[1].split("\n");
    for (let i = 0; i < lines.length; i++) {
      const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i]);
      if (!kv) continue;
      let value = kv[2].trim();
      // Folded/literal block scalars: take the indented lines below.
      if (value === ">" || value === "|" || value === ">-" || value === "|-") {
        const block: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
          block.push(lines[++i].trim());
        }
        value = block.join(" ");
      }
      fields[kv[1]] = value.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  const body = (m ? src.slice(m[0].length) : src).trim();
  return {
    name: extensionSlug(fields.name || fallbackName) || "skill",
    description: fields.description ?? "",
    body,
  };
}

/* ---------- local persistence ---------- */

const LIST_KEY = "cotenk-extensions:local";
const SECRETS_KEY = "cotenk-extension-secrets";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

const isExtension = (v: unknown): v is Extension =>
  !!v &&
  typeof v === "object" &&
  ["skill", "mcp", "plugin"].includes((v as Extension).kind) &&
  typeof (v as Extension).id === "string" &&
  ((v as Extension).kind !== "plugin" ||
    (Array.isArray((v as PluginExtension).skills) &&
      Array.isArray((v as PluginExtension).servers)));

function loadList(): Extension[] {
  const list = readJson<unknown[]>(LIST_KEY);
  return Array.isArray(list) ? list.filter(isExtension) : [];
}

/** Secret values (env vars / headers) of one MCP server, this device only. */
export function extensionSecrets(id: string): Record<string, string> {
  return readJson<Record<string, Record<string, string>>>(SECRETS_KEY)?.[id] ?? {};
}

export function storeExtensionSecrets(id: string, values: Record<string, string>) {
  const all = readJson<Record<string, Record<string, string>>>(SECRETS_KEY) ?? {};
  const kept = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== ""),
  );
  if (Object.keys(kept).length > 0) all[id] = kept;
  else delete all[id];
  writeJson(SECRETS_KEY, all);
}

/** Names whose value is not set on this device yet. */
export function missingSecrets(e: McpExtension): string[] {
  const values = extensionSecrets(e.id);
  return e.secretKeys.filter((k) => !values[k]);
}

/* ---------- store ---------- */

type ExtensionState = {
  items: Extension[];
  add: (draft: ExtensionDraft) => Extension;
  update: (id: string, patch: Partial<ExtensionDraft>) => void;
  remove: (id: string) => void;
};

export const useExtensions = create<ExtensionState>()((set, get) => ({
  items: loadList(),

  add: (draft) => {
    const ext = { ...draft, id: newId(), updatedAt: Date.now() } as Extension;
    set({ items: [...get().items, ext] });
    return ext;
  },

  update: (id, patch) =>
    set({
      items: get().items.map((e) =>
        e.id === id
          ? ({ ...e, ...patch, id, kind: e.kind, updatedAt: Date.now() } as Extension)
          : e,
      ),
    }),

  remove: (id) => {
    const target = get().items.filter((e) => e.id === id);
    storeExtensionSecrets(id, {});
    expandExtensions(target).forEach((x) => storeExtensionSecrets(x.id, {}));
    set({ items: get().items.filter((e) => e.id !== id) });
  },
}));

useExtensions.subscribe((s, prev) => {
  if (s.items !== prev.items) writeJson(LIST_KEY, s.items);
});
