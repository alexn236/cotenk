import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { btn } from "@/components/ui/styles";
import {
  isReady,
  tryOnWelcomePage,
  useAgentSetup,
  useSetupProbes,
} from "@/lib/agent-setup";
import { useAgent } from "@/lib/agent-store";
import { AGENT_KINDS, AGENTS, type AgentKind } from "@/lib/agents";
import { AgentIntro, AgentSteps } from "./agent-setup-guide";

/** What each agent asks of people, shown on the pick step. */
const NEEDS: Record<AgentKind, string> = {
  claude: "A Claude account · installs through npm",
  devin: "A Devin account · comes with its own installer",
};

type Phase = { step: "pick" } | { step: "setup"; i: number } | { step: "done" };

/**
 * Agents step of the welcome flow (desktop only): choose which agents
 * to use — Claude Code, Devin CLI — then set each one up in turn. The Home checklist and Settings → Agents cover
 * everything later.
 */
export function AgentOnboardingSteps({ onFinish }: { onFinish: () => void }) {
  const setup = useAgentSetup((s) => s.setup);
  const setDefaultAgent = useAgent((s) => s.setDefaultAgent);
  const defaultAgent = useAgent((s) => s.defaultAgent);
  const [picked, setPicked] = useState<AgentKind[]>(["claude"]);
  /** Agents still to set up, fixed when leaving the pick step. */
  const [queue, setQueue] = useState<AgentKind[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  useSetupProbes();

  const toggle = (k: AgentKind) =>
    setPicked((p) =>
      p.includes(k)
        ? p.filter((x) => x !== k)
        : AGENT_KINDS.filter((x) => x === k || p.includes(x)),
    );

  const toDone = () => {
    // The first picked agent that works becomes the default.
    const first = picked.find((k) => isReady(useAgentSetup.getState().setup[k]));
    if (first) setDefaultAgent(first);
    setPhase({ step: "done" });
  };

  if (phase.step === "pick") {
    const start = () => {
      const todo = picked.filter((k) => !isReady(setup[k]));
      setQueue(todo);
      if (todo.length) setPhase({ step: "setup", i: 0 });
      else toDone();
    };
    return (
      <div className="flex flex-col gap-4 p-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          Which agents do you want to work with? They run on your machine and
          edit your pages with you. Pick one or more; you can change this any
          time in Settings → Agents.
        </p>
        <div className="flex flex-col gap-2" role="group" aria-label="Agents">
          {AGENT_KINDS.map((k) => {
            const on = picked.includes(k);
            const ready = isReady(setup[k]);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                aria-pressed={on}
                className={`flex items-start gap-3 rounded-[10px] border px-3 py-3 text-left transition-colors ${
                  on
                    ? "border-accent-line bg-accent-dim/40"
                    : "border-line-soft bg-panel hover:bg-hover"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border ${
                    on ? "border-accent bg-accent text-on-accent" : "border-line"
                  }`}
                >
                  {on && <Check size={10} weight="bold" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] text-ink">
                    {AGENTS[k].name}
                    {ready && (
                      <span className="flex items-center gap-1 text-[11px] text-ink-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                        connected
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">
                    {NEEDS[k]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onFinish} className={btn.ghost}>
            Skip for now
          </button>
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={start}
            className={btn.primary}
          >
            Continue
            <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  if (phase.step === "setup") {
    const kind = queue[phase.i];
    const last = phase.i === queue.length - 1;
    const ready = isReady(setup[kind]);
    const next = () =>
      last ? toDone() : setPhase({ step: "setup", i: phase.i + 1 });
    return (
      <div className="flex flex-col gap-4 p-4">
        <div>
          {queue.length > 1 && (
            <div className="text-[11.5px] text-ink-3">
              Agent {phase.i + 1} of {queue.length}
            </div>
          )}
          <div className="text-[14px] font-medium text-ink">
            Set up {AGENTS[kind].name}
          </div>
        </div>
        <AgentIntro kind={kind} />
        <AgentSteps kind={kind} />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setPhase(
                phase.i === 0 ? { step: "pick" } : { step: "setup", i: phase.i - 1 },
              )
            }
            className={btn.ghost}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <button
            type="button"
            onClick={next}
            className={ready ? btn.primary : btn.secondary}
          >
            {ready ? (last ? "Finish" : "Next agent") : "Skip this one"}
            {ready && <ArrowRight size={12} weight="bold" />}
          </button>
        </div>
      </div>
    );
  }

  const readyPicked = picked.filter((k) => isReady(setup[k]));
  return (
    <div className="flex flex-col gap-4 p-4">
      <ul className="flex flex-col gap-1.5">
        {picked.map((k) => (
          <li
            key={k}
            className="flex items-center gap-2.5 rounded-[10px] border border-line-soft bg-panel px-3 py-2.5 text-[13px]"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isReady(setup[k]) ? "bg-emerald-500/80" : "bg-ink-3/40"
              }`}
            />
            <span className="flex-1 text-ink">{AGENTS[k].name}</span>
            <span className="text-[12px] text-ink-3">
              {isReady(setup[k]) ? "ready" : "not set up yet"}
            </span>
          </li>
        ))}
      </ul>
      {readyPicked.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          Default agent:
          {readyPicked.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setDefaultAgent(k)}
              aria-pressed={k === defaultAgent}
              className={`h-7 rounded-full border px-2.5 text-[12px] transition-colors ${
                k === defaultAgent
                  ? "border-accent bg-accent-dim text-ink"
                  : "border-line bg-panel text-ink-2 hover:bg-hover"
              }`}
            >
              {AGENTS[k].name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        {readyPicked.length
          ? "Every chat, Ask agent and task can use any connected agent. Add skills and MCP servers in Settings → Agent customisation."
          : "No agent is connected yet. The checklist on Home and Settings → Agents pick up where you left off."}
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onFinish}
          className={readyPicked.length ? btn.secondary : btn.primary}
        >
          Done
        </button>
        {readyPicked.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onFinish();
              tryOnWelcomePage(
                readyPicked.includes(defaultAgent) ? defaultAgent : readyPicked[0],
              );
            }}
            className={btn.primary}
          >
            Try it on the welcome page
            <ArrowRight size={12} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
