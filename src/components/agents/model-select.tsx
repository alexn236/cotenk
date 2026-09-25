import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { CaretDown, Cpu } from "@phosphor-icons/react";
import { useAgent } from "@/lib/agent-store";
import { isDesktop } from "@/lib/workspace";
import { ModelPicker } from "./model-picker";

/**
 * Compact model button + picker for every place that starts an agent
 * turn outside the chat (Ask agent, Build with AI, command palette).
 * It edits the default model, which every new chat starts with — so the
 * choice applies to the next request and is remembered.
 *
 * The picker renders in a portal anchored to the button, so popovers and
 * dialogs with overflow clipping don't cut it off.
 */
export function ModelSelect({
  placement = "down",
}: {
  placement?: "up" | "down";
}) {
  const models = useAgent((s) => s.models);
  const defaultModel = useAgent((s) => s.defaultModel);
  const currentModel = useAgent((s) => s.currentModel);
  const setDefaultModel = useAgent((s) => s.setDefaultModel);
  const refresh = useAgent((s) => s.refresh);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // The model list comes from the agent process; load it lazily.
  useEffect(() => {
    if (models.length === 0 && isDesktop()) void refresh();
  }, [models.length, refresh]);

  const effective = defaultModel || currentModel || "";
  const name = effective
    ? (models.find((m) => m.value === effective)?.name ?? effective)
    : "Model";

  const toggle = () =>
    setRect((r) =>
      r ? null : (btnRef.current?.getBoundingClientRect() ?? null),
    );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title="Model for the next request"
        aria-haspopup="dialog"
        aria-expanded={rect !== null}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] border border-line bg-panel-2 px-2 text-[11.5px] text-ink-2 transition-colors duration-150 hover:bg-hover"
      >
        <Cpu size={12} className="text-ink-3" />
        <span className="max-w-[110px] truncate">{name}</span>
        <CaretDown size={9} className="text-ink-3" />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          // Stop clicks from reaching whatever hosts the button (rows,
          // backdrops of the surrounding popover).
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <AnimatePresence>
              {rect && (
                <>
                  <div
                    key="model-select-backdrop"
                    className="fixed inset-0 z-[79]"
                    onClick={() => setRect(null)}
                  />
                  <div
                    key="model-select-anchor"
                    className="fixed z-[80]"
                    style={{
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                    }}
                  >
                    {models.length === 0 ? (
                      <div
                        className={`absolute right-0 w-[260px] rounded-[10px] border border-line bg-panel p-3 text-[12px] leading-relaxed text-ink-3 shadow-[0_16px_48px_var(--color-shadow)] ${
                          placement === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5"
                        }`}
                      >
                        {isDesktop()
                          ? "Loading models from the agent… Connect Devin CLI in Settings → Agents if this stays empty."
                          : "Models are available in the desktop app, where the agent runs."}
                      </div>
                    ) : (
                      <ModelPicker
                        models={models}
                        active={defaultModel}
                        placement={placement}
                        onPick={setDefaultModel}
                        onClose={() => setRect(null)}
                      />
                    )}
                  </div>
                </>
              )}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </>
  );
}
