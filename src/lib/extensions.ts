import { create } from "zustand";
import { getSupabase } from "./supabase";
import { newId } from "./ids";

/**
 * Skills and MCP servers that exist only inside CoTenk. They are handed to
 * Claude Code / Devin CLI per ACP session (see agent/extensions-runtime.ts)
 * and never written to ~/.claude, ~/.config/devin or the workspace, so the
 * CLIs run outside CoTenk never see them.
 *
 * The list is kept per scope (this device signed out, or one account) and
 * synced to Supabase while signed in. Secret values — env vars of a
 * command server, headers of a URL server — stay on this device; only
 * their names sync, so a new device asks for them once.
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

/** "off" = signed out; "missing" = the Supabase migration isn't applied. */
export type RemoteState = "off" | "syncing" | "synced" | "missing" | "error";

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

const LOCAL = "local";
const listKey = (scope: string) => `cotenk-extensions:${scope}`;
const syncedKey = (userId: string) => `cotenk-extensions-synced:${userId}`;
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

function loadScope(scope: string): Extension[] {
  const list = readJson<unknown[]>(listKey(scope));
  return Array.isArray(list) ? list.filter(isExtension) : [];
}

let scope = LOCAL;

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
  remote: RemoteState;
  add: (draft: ExtensionDraft) => Extension;
  update: (id: string, patch: Partial<ExtensionDraft>) => void;
  remove: (id: string) => void;
};

export const useExtensions = create<ExtensionState>()((set, get) => ({
  items: loadScope(LOCAL),
  remote: "off",

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
  if (s.items !== prev.items) writeJson(listKey(scope), s.items);
});

/** Switches the list on screen to another scope (account or device). */
function switchScope(next: string) {
  if (next === scope) return;
  scope = next;
  let items = loadScope(next);
  // First sign-in on this device: the device's extensions come along.
  if (next !== LOCAL && readJson(listKey(next)) === null) {
    items = loadScope(LOCAL);
  }
  useExtensions.setState({ items });
  writeJson(listKey(next), items);
}

/* ---------- supabase sync ---------- */

type Row = {
  id: string;
  user_id: string;
  kind: "skill" | "mcp" | "plugin";
  name: string;
  enabled: boolean;
  data: Record<string, unknown>;
  updated_at: number | string;
};

function toRow(e: Extension, userId: string): Row {
  const { id, kind, name, enabled, updatedAt, ...data } = e;
  return {
    id,
    user_id: userId,
    kind,
    name,
    enabled,
    data,
    updated_at: updatedAt,
  };
}

function fromRow(r: Row): Extension | null {
  const base = {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    updatedAt: Number(r.updated_at) || 0,
  };
  const d = r.data ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  if (r.kind === "skill") {
    return { ...base, kind: "skill", description: str(d.description), body: str(d.body) };
  }
  const server = (v: unknown): PluginServer | null => {
    if (!v || typeof v !== "object") return null;
    const s = v as Record<string, unknown>;
    return {
      name: str(s.name),
      transport: s.transport === "http" ? "http" : "stdio",
      command: str(s.command),
      args: strs(s.args),
      url: str(s.url),
      secretKeys: strs(s.secretKeys),
    };
  };
  if (r.kind === "mcp") {
    const s = server(d);
    return s && { ...s, ...base, name: r.name, kind: "mcp" };
  }
  if (r.kind === "plugin") {
    const list = (v: unknown) => (Array.isArray(v) ? v : []);
    return {
      ...base,
      kind: "plugin",
      description: str(d.description),
      skills: list(d.skills).map((s) => ({
        name: str(s?.name),
        description: str(s?.description),
        body: str(s?.body),
      })),
      servers: list(d.servers)
        .map(server)
        .filter((s): s is PluginServer => !!s),
    };
  }
  return null;
}

const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/i.test(e.message ?? ""));

/**
 * Sync for one signed-in user. Which rows exist on the server is
 * remembered per device ("synced ids"), so a delete on either side is
 * told apart from a row that's simply new:
 *
 *  - local only + synced before → deleted on another device → dropped
 *  - local only + never synced → new here → pushed
 *  - synced + gone locally → deleted here → deleted remotely
 *  - on both → newer `updatedAt` wins
 */
export function initExtensionSync(userId: string): () => void {
  switchScope(userId);
  const sb = getSupabase();
  const synced = new Set(readJson<string[]>(syncedKey(userId)) ?? []);
  const saveSynced = () => writeJson(syncedKey(userId), [...synced]);
  /** Objects that match the server (extensions are immutable). */
  const pushed = new WeakSet<Extension>();
  let disposed = false;
  let pulled = false;
  let failures = 0;
  let lastPull = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let dirty = false;
  let applyingRemote = false;

  const setRemote = (remote: RemoteState) => {
    if (!disposed) useExtensions.setState({ remote });
  };

  const pushOnce = async () => {
    const items = useExtensions.getState().items;
    const changed = items.filter((e) => !pushed.has(e));
    const localIds = new Set(items.map((e) => e.id));
    const deletes = [...synced].filter((id) => !localIds.has(id));
    if (changed.length > 0) {
      const { error } = await sb
        .from("agent_extensions")
        .upsert(changed.map((e) => toRow(e, userId)));
      if (error) throw error;
      changed.forEach((e) => {
        pushed.add(e);
        synced.add(e.id);
      });
    }
    if (deletes.length > 0) {
      const { error } = await sb
        .from("agent_extensions")
        .delete()
        .in("id", deletes);
      if (error) throw error;
      deletes.forEach((id) => synced.delete(id));
    }
    saveSynced();
  };

  const flush = (): Promise<void> => {
    if (!pulled || disposed) return Promise.resolve();
    if (inflight) {
      dirty = true;
      return inflight;
    }
    dirty = false;
    setRemote("syncing");
    inflight = (async () => {
      try {
        await pushOnce();
        setRemote("synced");
      } catch {
        setRemote("error");
        if (!disposed) timer = setTimeout(() => void flush(), 5000);
      } finally {
        inflight = null;
      }
      if (dirty && !disposed) await flush();
    })();
    return inflight;
  };

  const pull = async () => {
    lastPull = Date.now();
    setRemote("syncing");
    const { data, error } = await sb
      .from("agent_extensions")
      .select("*")
      .order("created_at");
    if (disposed) return;
    if (error) {
      if (missingTable(error)) {
        setRemote("missing"); // migration pending — stay local
        return;
      }
      failures += 1;
      setRemote("error");
      timer = setTimeout(
        () => void pull(),
        Math.min(60_000, 3000 * 2 ** Math.min(failures, 5)),
      );
      return;
    }
    failures = 0;
    const remote = ((data ?? []) as Row[])
      .map(fromRow)
      .filter((e): e is Extension => !!e);
    const remoteById = new Map(remote.map((e) => [e.id, e]));
    const local = useExtensions.getState().items;
    const localIds = new Set(local.map((e) => e.id));

    const merged: Extension[] = [];
    for (const l of local) {
      const r = remoteById.get(l.id);
      if (!r) {
        if (synced.has(l.id)) synced.delete(l.id); // deleted elsewhere
        else merged.push(l); // new here
        continue;
      }
      if (r.updatedAt > l.updatedAt) {
        pushed.add(r);
        merged.push(r);
      } else {
        if (r.updatedAt === l.updatedAt) pushed.add(l);
        merged.push(l);
      }
    }
    for (const r of remote) {
      // On the server but not here: known before → deleted here, the
      // push removes it; unknown → new from another device.
      if (!localIds.has(r.id) && !synced.has(r.id)) {
        pushed.add(r);
        merged.push(r);
      }
      synced.add(r.id);
    }
    saveSynced();
    applyingRemote = true;
    try {
      useExtensions.setState({ items: merged });
    } finally {
      applyingRemote = false;
    }
    pulled = true;
    await flush();
  };

  const unsub = useExtensions.subscribe((s, prev) => {
    if (s.items === prev.items || applyingRemote || !pulled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 800);
  });

  // Another device may have changed something — refresh on focus.
  const onFocus = () => {
    if (pulled && !inflight && Date.now() - lastPull > 30_000) void pull();
  };
  const onOnline = () => void (pulled ? flush() : pull());
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  void pull();
  return () => {
    disposed = true;
    unsub();
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    if (timer) clearTimeout(timer);
    // Leave the account's list behind; the device list comes back.
    switchScope(LOCAL);
    useExtensions.setState({ remote: "off" });
  };
}
