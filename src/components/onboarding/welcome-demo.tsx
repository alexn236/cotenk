import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Lightning, Sparkle } from "@phosphor-icons/react";

/**
 * Looping mini demo on the first welcome screen: you ask, an agent writes
 * into the page (the same glow real agent edits get), a task is ticked
 * off. Shows the whole idea in a few seconds.
 */

type Line =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "task"; text: string; who: string };

const ASK = "Turn my notes into a launch plan";
const LINES: Line[] = [
  { kind: "h", text: "Launch plan" },
  { kind: "p", text: "Ship the beta to 50 testers, collect feedback in one page." },
  { kind: "task", text: "Draft the announcement", who: "@claude" },
  { kind: "task", text: "Invite the first testers", who: "@you" },
];

/** Phases: 0 typing the ask · 1..4 lines appear · 5 tick · 6 hold. */
const TYPE_MS = 38;
const STEP_MS = 650;

export function WelcomeDemo() {
  const reduceMotion = useReducedMotion();
  const [typed, setTyped] = useState(reduceMotion ? ASK.length : 0);
  const [phase, setPhase] = useState(reduceMotion ? 6 : 0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 0) {
      if (typed < ASK.length) {
        t = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
      } else {
        t = setTimeout(() => setPhase(1), 450);
      }
    } else if (phase <= LINES.length + 1) {
      t = setTimeout(() => setPhase((p) => p + 1), phase === LINES.length + 1 ? 900 : STEP_MS);
    } else {
      t = setTimeout(() => {
        setTyped(0);
        setPhase(0);
        setLoop((n) => n + 1);
      }, 2600);
    }
    return () => clearTimeout(t);
  }, [phase, typed, reduceMotion]);

  const shown = Math.min(LINES.length, Math.max(0, phase));
  const ticked = phase >= LINES.length + 1;
  const working = phase >= 1 && phase <= LINES.length;

  return (
    <div
      aria-hidden
      className="w-full overflow-hidden rounded-[14px] border border-line-soft bg-panel text-left shadow-[0_24px_60px_-24px_var(--shadow)]"
    >
      <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="ml-2 font-mono text-[10.5px] text-ink-3">notes/launch.md</span>
        <AnimatePresence>
          {working && (
            <motion.span
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-dim px-2 py-px text-[10.5px] text-accent"
            >
              <Lightning size={10} weight="fill" />
              Claude Code is writing
              <span className="inline-flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1 w-1 rounded-full bg-accent"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-[188px] flex-col gap-1 px-5 py-4">
        <div className="mb-2 flex items-center gap-2 rounded-[8px] border border-line-soft bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink-2">
          <Sparkle size={12} weight="fill" className="shrink-0 text-accent" />
          <span className="truncate">
            {ASK.slice(0, typed)}
            {phase === 0 && (
              <motion.span
                className="ml-px inline-block h-3 w-px translate-y-0.5 bg-ink-2"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}
          </span>
        </div>

        {LINES.slice(0, shown).map((line, i) => (
          <motion.div
            key={`${loop}-${i}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            {!reduceMotion && (
              <span className="agent-flash pointer-events-none absolute -inset-x-2 -inset-y-0.5 rounded-[6px]" />
            )}
            {line.kind === "h" ? (
              <div className="relative text-[16px] font-semibold tracking-[-0.01em] text-ink">
                {line.text}
              </div>
            ) : line.kind === "p" ? (
              <div className="relative text-[12.5px] leading-relaxed text-ink-2">
                {line.text}
              </div>
            ) : (
              <div className="relative flex items-center gap-2 text-[12.5px] text-ink">
                <motion.span
                  animate={
                    ticked && i === 2 && !reduceMotion
                      ? { scale: [0.7, 1.2, 1] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.32 }}
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px] ${
                    ticked && i === 2
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel-2"
                  }`}
                >
                  {ticked && i === 2 && <Check size={9} weight="bold" />}
                </motion.span>
                <span
                  className={`relative transition-colors duration-300 ${
                    ticked && i === 2 ? "text-ink-3" : ""
                  }`}
                >
                  {line.text}
                  <span
                    className={`absolute left-0 top-1/2 h-px bg-ink-3 transition-[width] duration-500 ease-out-expo ${
                      ticked && i === 2 ? "w-full" : "w-0"
                    }`}
                  />
                </span>
                <span className="rounded-full border border-line px-1.5 text-[10px] text-ink-3">
                  {line.who}
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
