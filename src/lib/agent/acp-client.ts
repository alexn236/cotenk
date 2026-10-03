import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  apiKeyOverride,
  DESKTOP_ONLY_MESSAGE,
  isDesktop,
  resolveWorkspaceDir,
} from "../workspace";
import type { ModelOption } from "../agent-models";
import { AGENTS, type AgentKind } from "../agents";
import {
  prepareAgent,
  sessionExtensions,
  type SessionExtensions,
} from "./extensions-runtime";
import {
  cancelPermissions,
  requestPermission,
  type FileDiff,
  type PermissionOption,
} from "../agent-permissions";

/**
 * ACP (Agent Client Protocol) client for the local agents — `devin acp`
 * and the Claude Code ACP adapter. Speaks newline-delimited JSON-RPC 2.0.
 * The child processes are owned by the Rust side (src-tauri); this class
 * keeps all session, config-option and event-mapping logic in one place.
 * One client (and process) per agent kind, one ACP session per chat
 * (sessionId keyed by chat).
 */

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  /** `title` is null on updates that only carry a new status. */
  | { type: "tool"; id: string | null; title: string | null; status: string }
  | { type: "plan"; text: string }
  | { type: "usage"; used: number; size: number }
  | { type: "done"; stopReason: string }
  | { type: "error"; message: string };

export type { ModelOption };

/** A slash command the agent itself offers (ACP available_commands_update). */
export type AgentCommand = {
  name: string;
  description: string;
  /** Hint for the text after the command, e.g. "<description>". */
  hint: string | null;
};

const commandListeners = new Set<(kind: AgentKind, cmds: AgentCommand[]) => void>();

/** Called whenever an agent reports (new) slash commands. */
export function onAgentCommands(
  fn: (kind: AgentKind, cmds: AgentCommand[]) => void,
): () => void {
  commandListeners.add(fn);
  return () => commandListeners.delete(fn);
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

type JsonRpcMsg = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
};

type ConfigOption = {
  id: string;
  currentValue?: string;
  options?: {
    value: string;
    name: string;
    _meta?: Record<string, unknown>;
  }[];
};

export type AcpBootstrap = {
  ok: boolean;
  models: ModelOption[];
  currentModel: string | null;
  busy: boolean;
  lastError: string | null;
  sessions: Record<string, string>;
};

class AcpClient {
  private nextId = 1;
  private pending = new Map<number | string, Pending>();
  private listeners = new Set<(e: AgentEvent) => void>();
  private running = false;
  private starting: Promise<void> | null = null;
  private cwd: string | null = null;
  /** chatKey → acp sessionId */
  private sessions = new Map<string, string>();
  /** chatKey → model already applied to that session */
  private appliedModels = new Map<string, string>();
  models: ModelOption[] = [];
  /** The account's default model (configOptions.model.currentValue). */
  currentModel: string | null = null;
  modes: { id: string; name: string }[] = [];
  busy = false;
  lastError: string | null = null;
  /** `false` when the agent said it takes no images; unknown otherwise. */
  private imageSupport: boolean | null = null;

  constructor(readonly kind: AgentKind) {}

  private get label() {
    return AGENTS[this.kind].name;
  }

  /** Status + model list for the UI; lazily boots the ACP process. */
  async bootstrap(): Promise<AcpBootstrap> {
    try {
      await this.ensureSession("_bootstrap");
    } catch (e) {
      return {
        ok: false,
        models: this.models,
        currentModel: this.currentModel,
        busy: this.busy,
        lastError:
          e instanceof Error ? e.message : `${this.label} unavailable`,
        sessions: this.sessionMap(),
      };
    }
    return {
      ok: true,
      models: this.models,
      currentModel: this.currentModel,
      busy: this.busy,
      lastError: this.lastError,
      sessions: this.sessionMap(),
    };
  }

  /** Spawn + initialize + authenticate (memoized). */
  private async ensureProcess(): Promise<void> {
    if (this.running) return;
    if (!this.starting) {
      this.starting = this.start().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  private async start(): Promise<void> {
    if (!isDesktop()) throw new Error(DESKTOP_ONLY_MESSAGE);
    // Devin authenticates over ACP with the CLI's stored key; Claude
    // reuses its CLI login.
    let apiKey: string | null = null;
    if (this.kind === "devin") {
      apiKey =
        apiKeyOverride() ?? (await invoke<string | null>("devin_api_key"));
      if (!apiKey) {
        throw new Error(
          "No Devin credentials found — connect Devin CLI in Settings → Agents.",
        );
      }
    }
    // Listeners must be attached before the process emits anything.
    await ensureListening();
    this.cwd = await resolveWorkspaceDir();
    // Skills/MCP from Settings → Agent customisation; a broken extension
    // must not keep the agent from starting.
    const env = await prepareAgent(this.kind, this.cwd).catch(() => ({}));
    await invoke("acp_spawn", { agent: this.kind, dir: this.cwd, env });
    this.running = true;

    const init = (await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "cotenk", version: "0.1.0" },
    })) as { agentCapabilities?: { promptCapabilities?: { image?: boolean } } };
    this.imageSupport =
      init?.agentCapabilities?.promptCapabilities?.image === false ? false : null;
    if (apiKey) {
      await this.request("authenticate", {
        methodId: "devin-browser",
        _meta: { api_key: apiKey },
      });
    }
    this.lastError = null;
  }

  reset(reason: string) {
    cancelPermissions(this.kind);
    this.running = false;
    this.sessions.clear();
    this.appliedModels.clear();
    this.busy = false;
    this.lastError = reason;
    for (const p of this.pending.values()) {
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  /** The backend reported that the process ended. */
  onExit() {
    if (this.running) this.reset(`${this.label} exited`);
  }

  onLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRpcMsg;
    try {
      msg = JSON.parse(trimmed) as JsonRpcMsg;
    } catch {
      return;
    }
    this.onMessage(msg);
  }

  private onMessage(msg: JsonRpcMsg) {
    const hasId = msg.id !== undefined && msg.id !== null;
    if (msg.method && hasId) {
      this.onAgentRequest(msg);
      return;
    }
    if (msg.method) {
      this.onNotification(msg);
      return;
    }
    if (hasId) {
      const p = this.pending.get(msg.id!);
      this.pending.delete(msg.id!);
      if (!p) return;
      if (msg.error) p.reject(new Error(this.explain(msg.error)));
      else p.resolve(msg.result);
    }
  }

  /** Turns protocol errors into something a person can act on. */
  private explain(err: { code: number; message: string }): string {
    // -32000 is ACP's authRequired.
    if (err.code === -32000 || /auth(entication)? required/i.test(err.message)) {
      return `${this.label} is not signed in — connect it in Settings → Agents.`;
    }
    return err.message;
  }

  /**
   * Agent → client requests. Permission requests go through the review
   * flow (agent-permissions.ts): reads pass, edits and commands wait for
   * the person unless auto-approve is on.
   */
  private onAgentRequest(msg: JsonRpcMsg) {
    if (msg.method !== "session/request_permission") {
      this.send({ jsonrpc: "2.0", id: msg.id!, result: {} });
      return;
    }
    const p = (msg.params ?? {}) as {
      sessionId?: string;
      options?: PermissionOption[];
      toolCall?: {
        title?: string;
        kind?: string;
        content?: {
          type?: string;
          path?: string;
          oldText?: string | null;
          newText?: string;
        }[];
        rawInput?: Record<string, unknown>;
        locations?: { path?: string }[];
      };
    };
    const tc = p.toolCall ?? {};
    const diffs: FileDiff[] = (tc.content ?? [])
      .filter((c) => c.type === "diff" && typeof c.newText === "string")
      .map((c) => ({
        path: c.path ?? "",
        oldText: c.oldText ?? null,
        newText: c.newText!,
      }));
    const raw = tc.rawInput ?? {};
    const command =
      typeof raw.command === "string"
        ? raw.command
        : Array.isArray(raw.command)
          ? raw.command.join(" ")
          : null;
    // Every path the step names: diffs, ACP locations and common tool inputs.
    const paths = new Set<string>(diffs.map((d) => d.path));
    for (const l of tc.locations ?? []) if (l.path) paths.add(l.path);
    for (const key of [
      "file_path",
      "filePath",
      "path",
      "old_path",
      "new_path",
      "source",
      "destination",
      "target",
      "notebook_path",
    ]) {
      const v = raw[key];
      if (typeof v === "string" && v) paths.add(v);
    }
    for (const key of ["paths", "file_paths"]) {
      const v = raw[key];
      if (Array.isArray(v)) {
        for (const x of v) if (typeof x === "string" && x) paths.add(x);
      }
    }
    const id = msg.id!;
    void requestPermission({
      paths: [...paths],
      cwd: this.cwd,
      agent: this.kind,
      sessionId: p.sessionId ?? "",
      title: tc.title ?? "Tool call",
      // Edits without an explicit kind still carry diffs.
      kind: tc.kind ?? (diffs.length > 0 ? "edit" : null),
      diffs,
      command,
      options: p.options ?? [],
    }).then((optionId) => {
      this.send({
        jsonrpc: "2.0",
        id,
        result: {
          outcome: optionId
            ? { outcome: "selected", optionId }
            : { outcome: "cancelled" },
        },
      });
    });
  }

  private onNotification(msg: JsonRpcMsg) {
    if (msg.method !== "session/update") return;
    const u = msg.params?.update as
      | {
          sessionUpdate?: string;
          toolCallId?: string;
          content?: { type?: string; text?: string };
          title?: string;
          status?: string;
          used?: number;
          size?: number;
          entries?: { content?: string }[];
          configOptions?: ConfigOption[];
          availableCommands?: {
            name?: string;
            description?: string;
            input?: { hint?: string } | null;
          }[];
        }
      | undefined;
    if (!u?.sessionUpdate) return;
    const emit = (e: AgentEvent) => {
      for (const l of this.listeners) l(e);
    };
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        if (u.content?.text) emit({ type: "text", text: u.content.text });
        break;
      case "agent_thought_chunk":
        if (u.content?.text)
          emit({ type: "thought", text: u.content.text });
        break;
      case "tool_call":
      case "tool_call_update":
        emit({
          type: "tool",
          id: u.toolCallId ?? null,
          title: u.title ?? null,
          status: u.status ?? "pending",
        });
        break;
      case "plan":
        emit({
          type: "plan",
          text:
            u.entries
              ?.map((e) => e.content)
              .filter(Boolean)
              .join("\n") ?? "",
        });
        break;
      case "usage_update":
        if (typeof u.used === "number" && typeof u.size === "number") {
          emit({ type: "usage", used: u.used, size: u.size });
        }
        break;
      case "config_option_update":
        this.captureModels(u.configOptions);
        break;
      case "available_commands_update": {
        const cmds = (u.availableCommands ?? [])
          .filter((c) => typeof c.name === "string" && c.name.trim())
          .map((c) => ({
            name: c.name!.trim().replace(/^\//, ""),
            description: c.description?.trim() ?? "",
            hint: c.input?.hint?.trim() || null,
          }));
        for (const l of commandListeners) l(this.kind, cmds);
        break;
      }
    }
  }

  private captureModels(configOptions?: ConfigOption[]) {
    const model = configOptions?.find((o) => o.id === "model");
    if (model?.currentValue) this.currentModel = model.currentValue;
    if (model?.options?.length) {
      this.models = model.options.map((o) => ({
        value: o.value,
        name: o.name,
        supportsImages:
          o._meta?.["cognition.ai/supportsImages"] === true,
      }));
    }
  }

  private send(msg: Record<string, unknown>) {
    if (!this.running) return;
    void invoke("acp_write", {
      agent: this.kind,
      line: JSON.stringify(msg),
    }).catch((e) => {
      this.reset(e instanceof Error ? e.message : String(e));
    });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Creates (or returns) the ACP session bound to a chat. */
  async ensureSession(
    chatKey: string,
    model?: string,
  ): Promise<string> {
    await this.ensureProcess();
    const existing = this.sessions.get(chatKey);
    if (existing) {
      if (model && this.appliedModels.get(chatKey) !== model) {
        await this.setConfig(existing, "model", model);
        this.appliedModels.set(chatKey, model);
      }
      return existing;
    }
    const ext: SessionExtensions = await sessionExtensions(this.kind).catch(
      () => ({ mcpServers: [] }),
    );
    const res = (await this.request("session/new", {
      cwd: this.cwd ?? ".",
      ...ext,
    })) as { sessionId: string; configOptions?: ConfigOption[] };
    this.sessions.set(chatKey, res.sessionId);
    this.captureModels(res.configOptions);
    if (model) {
      try {
        await this.setConfig(res.sessionId, "model", model);
        this.appliedModels.set(chatKey, model);
      } catch {
        /* keep default model */
      }
    }
    return res.sessionId;
  }

  /** Returns the session's config options after the change, if sent. */
  private async setConfig(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<ConfigOption[] | undefined> {
    const res = (await this.request("session/set_config_option", {
      sessionId,
      configId,
      value,
    })) as { configOptions?: ConfigOption[] } | null;
    return res?.configOptions;
  }

  sessionFor(chatKey: string): string | null {
    return this.sessions.get(chatKey) ?? null;
  }

  sessionMap(): Record<string, string> {
    return Object.fromEntries(this.sessions);
  }

  /**
   * Run one prompt turn on the chat's session. `onEvent` receives every
   * streamed update; resolves when the agent finishes the turn.
   */
  async prompt(
    chatKey: string,
    text: string,
    model: string | undefined,
    onEvent: (e: AgentEvent) => void,
    images: { data: string; mimeType: string }[] = [],
  ): Promise<void> {
    if (this.busy) throw new Error(`${this.label} is already running a turn.`);
    if (images.length > 0 && this.imageSupport === false) {
      throw new Error(`${this.label} doesn't accept images.`);
    }
    const sessionId = await this.ensureSession(chatKey, model);
    this.busy = true;
    const listener = (e: AgentEvent) => onEvent(e);
    this.listeners.add(listener);
    try {
      const res = (await this.request("session/prompt", {
        sessionId,
        prompt: [
          { type: "text", text },
          ...images.map((i) => ({ type: "image", ...i })),
        ],
      })) as { stopReason?: string; usage?: { totalTokens?: number } };
      onEvent({ type: "done", stopReason: res?.stopReason ?? "end_turn" });
    } finally {
      this.busy = false;
      this.listeners.delete(listener);
    }
  }

  cancel(chatKey?: string) {
    // Pending approvals must be answered "cancelled" per ACP.
    cancelPermissions(this.kind);
    const sessionId = chatKey
      ? this.sessions.get(chatKey)
      : [...this.sessions.values()][0];
    if (sessionId) {
      this.send({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId },
      });
    }
  }

  /** Terminate the agent subprocess (relogin, new API key). */
  async kill() {
    this.reset("stopped");
    await invoke("acp_kill", { agent: this.kind }).catch(() => {});
  }
}

// Survive Vite HMR: keep one client per agent (and its session map)
// across module reloads; drop the registry if its shape is stale.
const g = globalThis as unknown as {
  __cotenkAcpClients?: Map<AgentKind, AcpClient>;
  __cotenkAcpListening?: Promise<void>;
};
if (
  g.__cotenkAcpClients &&
  [...g.__cotenkAcpClients.values()].some(
    (c) => typeof c.onExit !== "function",
  )
) {
  g.__cotenkAcpClients = undefined;
}
const clients = (g.__cotenkAcpClients ??= new Map<AgentKind, AcpClient>());

export function acpClient(kind: AgentKind): AcpClient {
  let c = clients.get(kind);
  if (!c) {
    c = new AcpClient(kind);
    clients.set(kind, c);
  }
  return c;
}

/** Stops every agent — e.g. the workspace folder changed. */
export async function killAllAgents() {
  for (const c of clients.values()) c.reset("stopped");
  await invoke("acp_kill", {}).catch(() => {});
}

/** One pair of backend listeners, routed to the client by agent id.
 *  Looks clients up through the global registry so routing survives HMR. */
function ensureListening(): Promise<void> {
  return (g.__cotenkAcpListening ??= Promise.all([
    listen<{ agent: AgentKind; line: string }>("acp:line", (e) =>
      g.__cotenkAcpClients?.get(e.payload.agent)?.onLine(e.payload.line),
    ),
    listen<AgentKind>("acp:exit", (e) =>
      g.__cotenkAcpClients?.get(e.payload)?.onExit(),
    ),
  ]).then(() => undefined));
}
