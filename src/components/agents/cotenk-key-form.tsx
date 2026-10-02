import { useState } from "react";
import { btn } from "@/components/ui/styles";
import { useAgentSetup } from "@/lib/agent-setup";
import {
  PROVIDERS,
  providerInfo,
  useCotenkAgent,
  type ProviderId,
} from "@/lib/cotenk-agent";

/**
 * Provider + API key for the built-in CoTenk Agent. Keys are stored per
 * provider on this device only and handed to the agent process in its
 * environment; the active provider is the one the agent uses.
 */
export function CotenkKeyForm({ onSaved }: { onSaved?: () => void }) {
  const active = useCotenkAgent((s) => s.provider);
  const hasKey = useCotenkAgent((s) => s.hasKey);
  const saveCotenkKey = useAgentSetup((s) => s.saveCotenkKey);
  const [provider, setProvider] = useState<ProviderId>(active);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const info = providerInfo(provider);
  const saved = hasKey[provider];

  const run = async (key?: string | null) => {
    setSaving(true);
    try {
      await saveCotenkKey(provider, key);
      setDraft("");
      if (key !== null) onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setProvider(p.id);
              setDraft("");
            }}
            aria-pressed={p.id === provider}
            className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors ${
              p.id === provider
                ? "border-accent bg-accent-dim text-ink"
                : "border-line bg-panel text-ink-2 hover:bg-hover"
            }`}
          >
            {hasKey[p.id] && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  p.id === active ? "bg-emerald-500/80" : "bg-ink-3/50"
                }`}
              />
            )}
            {p.name}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void run(draft);
        }}
      >
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            saved ? `${info.name} key saved — paste to replace` : info.placeholder
          }
          autoComplete="off"
          spellCheck={false}
          aria-label={`${info.name} API key`}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-line bg-panel-2 px-2.5 font-mono text-[12px] text-ink outline-none placeholder:font-sans placeholder:text-ink-3 focus:border-accent"
        />
        {saved && !draft.trim() && provider !== active ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void run(undefined)}
            className={btn.primary}
          >
            Use {info.name}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim() || saving}
            className={btn.primary}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </form>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
        {saved && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void run(null)}
            className="hover:text-ink-2 hover:underline"
          >
            Remove key
          </button>
        )}
        <span>Stays on this device, never synced.</span>
      </div>
    </div>
  );
}
