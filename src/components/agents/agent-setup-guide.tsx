import type { ReactNode } from "react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import {
  INSTALLABLE,
  isReady,
  tryOnWelcomePage,
  useAgentSetup,
  useSetupProbes,
} from "@/lib/agent-setup";
import { AGENT_KINDS, AGENTS, type AgentKind } from "@/lib/agents";
import {
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_ONLY_MESSAGE,
  isDesktop,
  openExternal,
} from "@/lib/workspace";

const NODE_URL = "https://nodejs.org/en/download";

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
 * each step with its own button
 * and a live check. Replaces "run these npm commands in a terminal" from
 * the README — the terminal still opens (people should see what runs),
 * but CoTenk drives it.
 */
export function AgentSetupGuide() {
  const open = useAgentSetup((s) => s.guideOpen);
  const close = useAgentSetup((s) => s.closeGuide);
  return (
    <Modal open={open} onClose={close} title="Connect an agent" width={540}>
      {open && <GuideBody onClose={close} />}
    </Modal>
  );
}

/** What the browser build shows instead — agents need the desktop app. */
export function DesktopOnly() {
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

function GuideBody({ onClose }: { onClose: () => void }) {
  const kind = useAgentSetup((s) => s.guideKind);
  const setup = useAgentSetup((s) => s.setup);
  useSetupProbes();

  if (!isDesktop()) return <DesktopOnly />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-1.5">
        {AGENT_KINDS.map((k) => (
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
            {isReady(setup[k]) && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
            )}
            {AGENTS[k].name}
          </button>
        ))}
      </div>
      <AgentIntro kind={kind} />
      <AgentSteps kind={kind} />

      {isReady(setup[kind]) && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-accent-line bg-accent-dim/40 px-3 py-3">
          <span className="text-[13px] text-ink">
            {AGENTS[kind].name} is ready.
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              tryOnWelcomePage(kind);
            }}
            className={btn.primary}
          >
            Try it on the welcome page
            <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}

/** What the agent is and how far it reaches, in one paragraph. */
export function AgentIntro({ kind }: { kind: AgentKind }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-3">
      {AGENTS[kind].blurb}. It runs on your machine, starts in your workspace folder, and
      asks before it changes a page. Anything outside that folder needs
      your approval, every time.
    </p>
  );
}

/**
 * The setup steps of one agent — Node.js → install → sign in — each
 * with its own button and a live check.
 */
export function AgentSteps({ kind }: { kind: AgentKind }) {
  const s = useAgentSetup((st) => st.setup[kind]);
  const node = useAgentSetup((st) => st.node);
  const installing = useAgentSetup((st) => st.installing);
  const connecting = useAgentSetup((st) => st.connecting);
  const check = useAgentSetup((st) => st.check);
  const checkNode = useAgentSetup((st) => st.checkNode);
  const install = useAgentSetup((st) => st.install);
  const connect = useAgentSetup((st) => st.connect);

  const info = AGENTS[kind];
  const viaNpm = INSTALLABLE.includes(kind);
  const installed = !!s?.installed;
  // An agent that is already installed doesn't need Node.js to get it.
  const nodeOk = !!node?.npm || installed;
  const authed = !!s?.authed;

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
        ? node?.node
          ? `Node ${node.node} found.`
          : "Not needed, the agent is already installed."
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
            onClick={() => {
              void checkNode();
              void check(kind);
            }}
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
          ? nodeOk
            ? "Opens a terminal and runs npm install for you."
            : "Needs Node.js first — install it above, then click Check again."
          : `${info.name} comes with its own installer. Install it, then check again.`,
    actions: viaNpm ? (
      <button
        type="button"
        disabled={!!installing || !nodeOk}
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
  );
}
