import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { useToasts } from "@/lib/toast";
import { useWorkspace } from "@/lib/store";

/** Bottom-right toast stack — clear of composers and the agent pill. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const reduceMotion = useReducedMotion();
  // The chat composer sits at the bottom of the agents view — stay above it.
  const lifted = useWorkspace((s) => s.railSection === "agents");

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed right-5 z-[70] flex flex-col items-end gap-2 transition-[bottom] duration-200 ease-out-expo ${
        lifted ? "bottom-28" : "bottom-5"
      }`}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex max-w-[440px] items-center gap-3 rounded-[10px] border border-line bg-elev py-2 pl-3.5 pr-2 text-[12.5px] shadow-[0_12px_36px_var(--color-shadow)]"
          >
            <span
              className={`min-w-0 flex-1 truncate ${
                t.tone === "error" ? "text-danger" : "text-ink"
              }`}
            >
              {t.message}
            </span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-[6px] px-2 py-1 font-medium text-accent transition-colors duration-150 hover:bg-hover"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
