import { create } from "zustand";

/**
 * The built-in CoTenk Agent: OpenCode (github.com/sst/opencode, MIT),
 * started as `opencode acp` with the person's own API key. Everything it
 * needs travels in its environment — OPENCODE_CONFIG_CONTENT is merged
 * last, over any opencode.json — so nothing is written to ~/.config or
 * the workspace and a plain `opencode` run never sees the key.
 *
 * Skills come from CoTenk's skills folder (`skills.paths`), MCP servers
 * per ACP session like Claude Code (see agent/extensions-runtime.ts).
 * Keys stay on this device and never sync.
 */

export type ProviderId =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "google"
  | "deepseek"
  | "mistral";

export type Provider = {
  id: ProviderId;
  name: string;
  placeholder: string;
  /**
   * Model used until someone picks one, first that the provider lists.
   * OpenCode's own default is often an odd one (image models).
   */
  defaults: string[];
};

export const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    placeholder: "sk-ant-…",
    defaults: ["anthropic/claude-sonnet-5-5", "anthropic/claude-sonnet-5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-…",
    defaults: ["openai/gpt-5.6", "openai/gpt-5.5", "openai/gpt-5"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    placeholder: "sk-or-…",
    defaults: [
      "openrouter/anthropic/claude-sonnet-5.5",
      "openrouter/anthropic/claude-sonnet-5",
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    placeholder: "AIza…",
    defaults: ["google/gemini-3.5-flash"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    placeholder: "sk-…",
    defaults: ["deepseek/deepseek-v4-pro"],
  },
  {
    id: "mistral",
    name: "Mistral",
    placeholder: "…",
    defaults: ["mistral/mistral-large-latest"],
  },
];

const PROVIDER_KEY = "cotenk-agent-provider";
const keyKey = (p: ProviderId) => `cotenk-agent-key:${p}`;

const isProvider = (v: unknown): v is ProviderId =>
  PROVIDERS.some((p) => p.id === v);

export const providerInfo = (id: ProviderId) =>
  PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

const storedKeys = () =>
  Object.fromEntries(
    PROVIDERS.map((p) => [p.id, !!readLs(keyKey(p.id))]),
  ) as Record<ProviderId, boolean>;

type CotenkAgentState = {
  provider: ProviderId;
  /** Providers with a saved key (the values stay in storage). */
  hasKey: Record<ProviderId, boolean>;
  /**
   * Makes `provider` active and saves its key — null removes it,
   * undefined keeps the stored one.
   */
  saveKey: (provider: ProviderId, key?: string | null) => void;
  setProvider: (provider: ProviderId) => void;
};

const storedProvider = readLs(PROVIDER_KEY);

export const useCotenkAgent = create<CotenkAgentState>()((set, get) => ({
  provider: isProvider(storedProvider) ? storedProvider : "anthropic",
  hasKey: storedKeys(),
  saveKey: (provider, key) => {
    if (key !== undefined) writeLs(keyKey(provider), key?.trim() || null);
    // Removing another provider's key doesn't switch to it.
    const next = key === null ? get().provider : provider;
    writeLs(PROVIDER_KEY, next);
    set({ provider: next, hasKey: storedKeys() });
  },
  setProvider: (provider) => {
    writeLs(PROVIDER_KEY, provider);
    set({ provider });
  },
}));

/** The active provider's key, if one is saved. */
export function cotenkAgentKey(): string | null {
  return readLs(keyKey(useCotenkAgent.getState().provider));
}

export const cotenkAgentReady = () => !!cotenkAgentKey();

/** Environment for `opencode acp`; null until a key is saved. */
export function cotenkAgentEnv(skillsDir: string): Record<string, string> | null {
  const { provider } = useCotenkAgent.getState();
  const apiKey = cotenkAgentKey();
  if (!apiKey) return null;
  const config = {
    $schema: "https://opencode.ai/config.json",
    // Only the provider the key belongs to, so the model list is the
    // one people can actually use.
    enabled_providers: [provider],
    provider: { [provider]: { options: { apiKey } } },
    // Edits and commands go through CoTenk's review (agent-permissions).
    permission: { edit: "ask", bash: "ask", webfetch: "allow" },
    skills: { paths: [skillsDir] },
    autoupdate: false,
    share: "disabled",
  };
  return { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) };
}

/** The provider's preferred default, if it's in the agent's list. */
export function preferredModel(available: { value: string }[]): string | null {
  const values = new Set(available.map((m) => m.value));
  const { provider } = useCotenkAgent.getState();
  return providerInfo(provider).defaults.find((v) => values.has(v)) ?? null;
}

/** "Anthropic/Claude Sonnet 5.5" → "Claude Sonnet 5.5" (one provider). */
export const cleanModelName = (name: string) =>
  name.replace(/^[^/]+\//, "");
