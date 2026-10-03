import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Eye,
  Lightning,
} from "@phosphor-icons/react";
import { isDesktop } from "@/lib/workspace";
import { btn } from "@/components/ui/styles";
import { ThemePicker } from "@/components/ui/theme-picker";
import { AgentOnboardingSteps } from "@/components/agents/agent-onboarding";
import { WelcomeDemo } from "./welcome-demo";
import { usePermissions, type ApprovalMode } from "@/lib/agent-permissions";

type Screen = "welcome" | "theme" | "changes" | "agents" | "done";

const WIDTH: Record<Screen, number> = {
  welcome: 520,
  theme: 600,
  changes: 600,
  agents: 560,
  done: 420,
};

const CARD =
  "rounded-[14px] border border-line-soft bg-panel shadow-[0_24px_60px_-24px_var(--shadow)]";

function Mark({ size }: { size: "sm" | "lg" }) {
  return (
    <div
      className={`flex items-center justify-center bg-accent-dim ${
        size === "lg" ? "h-14 w-14 rounded-[14px]" : "h-7 w-7 rounded-[8px]"
      }`}
    >
      <span
        className={`font-semibold leading-none text-accent ${
          size === "lg" ? "text-[24px]" : "text-sm"
        }`}
      >
        C
      </span>
    </div>
  );
}

function Title({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {sub && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{sub}</p>
      )}
    </div>
  );
}

/** Dots for the fresh flow; the current one stretches. */
function Progress({ screens, current }: { screens: Screen[]; current: Screen }) {
  const at = screens.indexOf(current);
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Step ${at + 1} of ${screens.length}`}
    >
      {screens.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out-expo ${
            i === at
              ? "w-5 bg-accent"
              : i < at
                ? "w-1.5 bg-accent/50"
                : "w-1.5 bg-line"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Full-screen first run: welcome → theme → agent changes (review or
 * auto-approve) → agents on desktop, or welcome → theme → "all set" on
 * the web. Everything stays on this device — there is no account.
 */
export function WelcomeFlow({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("welcome");
  const desktop = isDesktop();
  const last: Screen = desktop ? "agents" : "done";
  const steps: Screen[] = desktop
    ? ["welcome", "theme", "changes", "agents"]
    : ["welcome", "theme", "done"];
  const next = (from: Screen) => steps[steps.indexOf(from) + 1] ?? last;
  const back = (from: Screen) => steps[Math.max(0, steps.indexOf(from) - 1)];

  let body: ReactNode;
  if (screen === "welcome") {
    body = (
      <div className="flex flex-col items-center text-center">
        <Mark size="lg" />
        <h1 className="mt-6 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          Welcome to CoTenk
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-2">
          Think together. Work together.
        </p>
        <p className="mt-4 max-w-[380px] text-[13px] leading-relaxed text-ink-3">
          An open workspace where people and AI agents share documents, tasks
          and context. Your agent writes into the same pages you do.
        </p>
        <div className="mt-7 w-full">
          <WelcomeDemo />
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {["Local-first, no account", "Open source", "Claude Code · Devin CLI"].map(
            (t) => (
              <span
                key={t}
                className="rounded-full border border-line-soft bg-panel px-2.5 py-1 text-[11.5px] text-ink-2"
              >
                {t}
              </span>
            ),
          )}
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => setScreen("theme")}
          className={`${btn.primary} mt-7`}
        >
          Get started
          <ArrowRight size={12} weight="bold" />
        </button>
      </div>
    );
  } else if (screen === "theme") {
    body = (
      <>
        <Title
          title="Pick a look"
          sub="Applies right away. You can change it any time in Settings → Appearance."
        />
        <div className="mt-6">
          <ThemePicker />
        </div>
        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setScreen("welcome")}
            className={btn.ghost}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <button
            type="button"
            onClick={() => setScreen(next("theme"))}
            className={btn.primary}
          >
            Continue
            <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      </>
    );
  } else if (screen === "changes") {
    body = (
      <>
        <Title
          title="How should agents change your pages?"
          sub="Reading never asks. You can switch any time in Settings → Agents."
        />
        <div className="mt-6">
          <ApprovalPicker />
        </div>
        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setScreen(back("changes"))}
            className={btn.ghost}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <button
            type="button"
            onClick={() => setScreen(next("changes"))}
            className={btn.primary}
          >
            Continue
            <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      </>
    );
  } else if (screen === "agents") {
    body = (
      <>
        <Title title="Connect your agents" />
        <div className={`${CARD} mt-5`}>
          <AgentOnboardingSteps onFinish={onDone} />
        </div>
      </>
    );
  } else {
    body = (
      <div className="flex flex-col items-center text-center">
        <CheckCircle size={40} weight="fill" className="text-accent" />
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-ink">
          You're all set
        </h2>
        <p className="mt-2 max-w-[340px] text-[13px] leading-relaxed text-ink-3">
          Your workspace is ready and lives in this browser. Agents run in
          the desktop app — the checklist on Home shows how to get it.
        </p>
        <button
          type="button"
          autoFocus
          onClick={onDone}
          className={`${btn.primary} mt-7`}
        >
          Open CoTenk
          <ArrowRight size={12} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-y-auto bg-canvas text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top,var(--accent-dim),transparent_70%)]"
      />
      <header className="relative flex h-14 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Mark size="sm" />
          <span className="text-[13px] font-medium text-ink-2">CoTenk</span>
        </div>
        <Progress screens={steps} current={screen} />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 pb-14 pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
            style={{ maxWidth: WIDTH[screen] }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

const APPROVAL_OPTIONS: {
  mode: ApprovalMode;
  title: string;
  desc: string;
  Icon: typeof Eye;
  badge?: string;
}[] = [
  {
    mode: "review",
    title: "Review changes",
    desc: "Each edit and command shows up as a diff first — you approve or reject it.",
    Icon: Eye,
    badge: "Recommended",
  },
  {
    mode: "auto",
    title: "Auto-approve",
    desc: "Agents edit your pages right away. You watch the changes land and undo with Ctrl Z. Commands still ask.",
    Icon: Lightning,
  },
];

/** Review vs. auto-approve, as two cards. */
function ApprovalPicker() {
  const mode = usePermissions((s) => s.mode);
  const setMode = usePermissions((s) => s.setMode);
  return (
    <div role="radiogroup" aria-label="Agent changes" className="grid gap-3 sm:grid-cols-2">
      {APPROVAL_OPTIONS.map(({ mode: m, title, desc, Icon, badge }) => {
        const on = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(m)}
            className={`flex flex-col items-start gap-2 rounded-[12px] border p-4 text-left transition-[background-color,border-color] duration-150 ${
              on
                ? "border-accent-line bg-accent-dim/50"
                : "border-line-soft bg-panel hover:bg-hover"
            }`}
          >
            <span className="flex w-full items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-[8px] ${
                  on ? "bg-accent text-on-accent" : "bg-panel-2 text-ink-3"
                }`}
              >
                <Icon size={14} weight="bold" />
              </span>
              <span className="text-[13.5px] font-medium text-ink">{title}</span>
              {badge && (
                <span className="ml-auto rounded-full bg-accent-dim px-1.5 py-px text-[10.5px] text-accent">
                  {badge}
                </span>
              )}
            </span>
            <span className="text-[12.5px] leading-relaxed text-ink-3">{desc}</span>
          </button>
        );
      })}
    </div>
  );
}
