import { useEffect, type ReactNode } from "react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import { INSTALLABLE, useAgentSetup, type AgentSetup } from "@/lib/agent-setup";
import { useAgent } from "@/lib/agent-store";
import { AGENTS, type AgentKind } from "@/lib/agents";
import { openWelcomePage, useWorkspace } from "@/lib/store";
import { WELCOME_ID } from "@/lib/welcome";
import {
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_ONLY_MESSAGE,
  isDesktop,
  openExternal,
} from "@/lib/workspace";

const CHOICES: AgentKind[] = ["claude", "devin"];
const NODE_URL = "https://nodejs.org/en/download";

const ready = (s?: AgentSetup) => !!s && s.installed && s.authed;

type StepState = "done" | "current" | "later";

function Step({
  n,
  state,
  title,
  desc,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  desc: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li
      className={`flex gap-3 rounded-[10px] border px-3 py-3 ${
        state === "current"
          ? "border-accent-line bg-accent-dim/40"
          : "border-line-soft bg-panel"
      }`}
    >
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium ${
          state === "done"
            ? "border-accent bg-accent text-on-accent"
            : state === "current"
              ? "border-accent text-accent"
              : "border-line text-ink-3"
        }`}
      >
        {state === "done" ? <Check size={10} weight="bold" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`text-[13px] ${state === "later" ? "text-ink-3" : "text-ink"}`}
        >
          {title}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
          {desc}
        </div>
        {state === "current" && children && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Guided agent setup: pick an agent, then Node.js → install → sign in,
 * each step with its own button and a live check. Replaces "run these
 * npm commands in a terminal" from the README — the terminal still
 * opens (people should see what runs), but CoTenk drives it.
 */
export function AgentSetupGuide() {
  const open = useAgentSetup((s) => s.guideOpen);
  const close = useAgentSetup((s) => s.closeGuide);
  return (
    <Modal open={open} onClose={close} title="Connect an agent" width={520}>
      {open && <GuideBody onClose={close} />}
    </Modal>
  );
}

function GuideBody({ onClose }: { onClose: () => void }) {
  const kind = useAgentSetup((s) => s.guideKind);
  const setup = useAgentSetup((s) => s.setup);
  const node = useAgentSetup((s) => s.node);
  const installing = useAgentSetup((s) => s.installing);
  const connecting = useAgentSetup((s) => s.connecting);
  const check = useAgentSetup((s) => s.check);
  const checkNode = useAgentSetup((s) => s.checkNode);
  const install = useAgentSetup((s) => s.install);
  const connect = useAgentSetup((s) => s.connect);
  const setDefaultAgent = useAgent((s) => s.setDefaultAgent);
  const desktop = isDesktop();

  useEffect(() => {
    if (!desktop) return;
    void checkNode();
    CHOICES.forEach((k) => void check(k));
  }, [desktop, check, checkNode]);

  if (!desktop) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {DESKTOP_ONLY_MESSAGE}
        </p>
        <button
          type="button"
          onClick={() => openExternal(DESKTOP_DOWNLOAD_URL)}
          className={btn.primary}
        >
          Get the desktop app
        </button>
      </div>
    );
  }

  const info = AGENTS[kind];
  const s = setup[kind];
  const viaNpm = INSTALLABLE.includes(kind);
  const nodeOk = !!node?.npm;
  const installed = !!s?.installed;
  const authed = !!s?.authed;

  const tryIt = () => {
    setDefaultAgent(kind);
    onClose();
    openWelcomePage();
    useWorkspace.getState().requestAskAgent(WELCOME_ID);
  };

  const steps: {
    title: string;
    done: boolean;
    desc: ReactNode;
    actions: ReactNode;
  }[] = [];
  if (viaNpm) {
    steps.push({
      title: "Node.js",
      done: nodeOk,
      desc: nodeOk
        ? `Node ${node?.node ?? ""} found.`
        : node
          ? `${info.name} installs through npm, which comes with Node.js. Install it, then check again.`
          : "Checking…",
      actions: node && (
        <>
          <button
            type="button"
            onClick={() => openExternal(NODE_URL)}
            className={btn.primary}
          >
            Get Node.js
          </button>
          <button
            type="button"
            onClick={() => void checkNode()}
            className={btn.secondary}
          >
            Check again
          </button>
        </>
      ),
    });
  }
  steps.push({
    title: `Install ${info.name}`,
    done: installed,
    desc: installed
      ? (s?.detail ?? "Installed.")
      : installing === kind
        ? "Installing in the terminal window — this takes a minute. This step ticks itself off when it's done."
        : viaNpm
          ? "Opens a terminal and runs npm install for you."
          : `${info.name} comes with its own installer. Install it, then check again.`,
    actions: viaNpm ? (
      <button
        type="button"
        disabled={!!installing}
        onClick={() => void install(kind)}
        className={btn.primary}
      >
        {installing === kind ? "Installing…" : "Install"}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => void check(kind)}
        className={btn.secondary}
      >
        Check again
      </button>
    ),
  });
  steps.push({
    title: "Sign in",
    done: authed,
    desc: authed
      ? "Signed in."
      : connecting === kind
        ? "Finish the sign-in in the window that opened — this step ticks itself off."
        : `${info.name} signs in with its own account. Your login never passes through CoTenk.`,
    actions: (
      <button
        type="button"
        disabled={!!connecting}
        onClick={() => void connect(kind)}
        className={btn.primary}
      >
        {connecting === kind ? "Waiting for sign-in…" : "Sign in"}
      </button>
    ),
  });
  const firstOpen = steps.findIndex((x) => !x.done);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-1.5">
        {CHOICES.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => useAgentSetup.setState({ guideKind: k })}
            aria-pressed={k === kind}
            className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${
              k === kind
                ? "border-accent bg-accent-dim text-ink"
                : "border-line bg-panel text-ink-2 hover:bg-hover"
            }`}
          >
            {ready(setup[k]) && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
            )}
            {AGENTS[k].name}
            {k === "claude" && (
              <span className="text-[11px] text-ink-3">recommended</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        {info.blurb}. It runs on your machine, starts in your workspace
        folder, and asks before it changes a page — changes outside that
        folder are refused.
      </p>

      <ol className="flex flex-col gap-2">
        {steps.map((st, i) => (
          <Step
            key={st.title}
            n={i + 1}
            state={st.done ? "done" : i === firstOpen ? "current" : "later"}
            title={st.title}
            desc={st.desc}
          >
            {st.actions}
          </Step>
        ))}
      </ol>

      {firstOpen === -1 && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-accent-line bg-accent-dim/40 px-3 py-3">
          <span className="text-[13px] text-ink">{info.name} is ready.</span>
          <button type="button" onClick={tryIt} className={btn.primary}>
            Try it on the welcome page
            <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
