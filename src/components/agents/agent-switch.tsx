import { useEffect } from "react";
import { AGENT_KINDS, AGENTS, type AgentKind } from "@/lib/agents";
import { useAgentSetup } from "@/lib/agent-setup";
import { isDesktop } from "@/lib/workspace";

/** Green when ready, amber when it needs sign-in, grey when missing. */
export function SetupDot({ kind }: { kind: AgentKind }) {
  const s = useAgentSetup((st) => st.setup[kind]);
  const cls = !s
    ? "bg-ink-3/40"
    : s.installed && s.authed
      ? "bg-emerald-500/70"
      : s.installed
        ? "bg-accent"
        : "bg-ink-3/40";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

/**
 * Segmented control for picking the agent. Shows each agent's
 * connection state so people see up front which one will answer.
 */
export function AgentSwitch({
  value,
  onChange,
  disabled,
}: {
  value: AgentKind;
  onChange: (kind: AgentKind) => void;
  /** e.g. the chat already started — sessions belong to one agent. */
  disabled?: boolean;
}) {
  const check = useAgentSetup((s) => s.check);
  const known = useAgentSetup((s) => s.setup);

  useEffect(() => {
    if (!isDesktop()) return;
    // The store caches results, so each agent is probed once.
    for (const k of AGENT_KINDS) if (!known[k]) void check(k);
  }, [check, known]);

  return (
    <div
      role="radiogroup"
      aria-label="Agent"
      className="grid grid-cols-2 gap-0.5 rounded-[8px] border border-line-soft bg-panel-2 p-0.5"
    >
      {AGENT_KINDS.map((k) => {
        const active = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled && !active}
            onClick={() => onChange(k)}
            title={AGENTS[k].blurb}
            className={`flex h-6 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 text-[11.5px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "bg-panel text-ink shadow-[0_1px_3px_var(--color-shadow)]"
                : "text-ink-3 hover:text-ink-2"
            }`}
          >
            <SetupDot kind={k} />
            {AGENTS[k].name}
          </button>
        );
      })}
    </div>
  );
}
