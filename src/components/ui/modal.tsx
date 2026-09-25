import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";

/**
 * Centered dialog over a dimmed backdrop. Escape and backdrop clicks
 * close it. `width` is the max width in px.
 */
export function Modal({
  open,
  onClose,
  title,
  width = 560,
  children,
  footer,
  align = "center",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** "top" pins the dialog near the top (command palette style). */
  align?: "center" | "top";
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`fixed inset-0 z-[60] flex justify-center bg-black/45 px-4 backdrop-blur-[2px] ${
            align === "top" ? "items-start pt-[12vh]" : "items-center py-8"
          }`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 4, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ maxWidth: width }}
            className="flex max-h-full w-full flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-[0_24px_64px_var(--color-shadow)]"
          >
            {title !== undefined && (
              <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-4 py-3">
                <div className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
                  {title}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
