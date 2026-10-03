import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { isDesktop } from "@/lib/workspace";
import { btn } from "@/components/ui/styles";
import { ThemePicker } from "@/components/ui/theme-picker";
import { AgentOnboardingSteps } from "@/components/agents/agent-onboarding";

type Screen = "welcome" | "theme" | "agents" | "done";

const WIDTH: Record<Screen, number> = {
  welcome: 480,
  theme: 600,
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
 * Full-screen first run: welcome → theme → agents (desktop) or "all
 * set" (web). Everything stays on this device — there is no account.
 */
export function WelcomeFlow({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("welcome");
  const desktop = isDesktop();
  const last: Screen = desktop ? "agents" : "done";

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
        <p className="mt-4 max-w-[360px] text-[13px] leading-relaxed text-ink-3">
          An open workspace where people and AI agents share documents, tasks
          and context.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => setScreen("theme")}
          className={`${btn.primary} mt-8`}
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
            onClick={() => setScreen(last)}
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
        <Progress screens={["welcome", "theme", last]} current={screen} />
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
