import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { CaretDown } from "@phosphor-icons/react";
import { useAgent } from "@/lib/agent-store";
import { useAgentSetup } from "@/lib/agent-setup";
import { AGENTS, type AgentKind } from "@/lib/agents";
import { isDesktop } from "@/lib/workspace";
import { ModelPicker } from "./model-picker";
import { AgentSwitch, SetupDot } from "./agent-switch";

const NOTE: Record<AgentKind, string> = {
  devin: "same pricing as devin cli",
  claude: "billed through your claude plan or api key",
};

/**
 * Agent + model button with its picker. Used everywhere a turn starts:
 * the chat composer (edits that chat) and one-off requests like Ask
 * agent, Build with AI and the command palette (edits the defaults, so
 * the choice applies to the next request and is remembered).
 *
 * The picker renders in a portal anchored to the button, so popovers and
 * dialogs with overflow clipping don't cut it off.
 */
export function ModelSelect({
  chatId,
  placement = "down",
  size = "sm",
}: {
  /** Edit this chat instead of the defaults. */
  chatId?: string;
  placement?: "up" | "down";
  size?: "sm" | "md";
}) {
  const chat = useAgent((s) =>
    chatId ? (s.chats.find((c) => c.id === chatId) ?? null) : null,
  );
  const defaultAgent = useAgent((s) => s.defaultAgent);
  const defaultModels = useAgent((s) => s.defaultModels);
  const modelsByAgent = useAgent((s) => s.models);
  const currentModel = useAgent((s) => s.currentModel);
  const setDefaultAgent = useAgent((s) => s.setDefaultAgent);
  const setDefaultModel = useAgent((s) => s.setDefaultModel);
  const setChatAgent = useAgent((s) => s.setChatAgent);
  const setChatModel = useAgent((s) => s.setChatModel);
  const refresh = useAgent((s) => s.refresh);
  const setup = useAgentSetup((s) => s.setup);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const agent = chat?.agent ?? defaultAgent;
  const model = chat ? chat.model : defaultModels[agent];
  // A started chat keeps its agent — its session lives in that process.
  const locked = !!chat && chat.messages.length > 0;
  const models = modelsByAgent[agent];
  const open = rect !== null;

  // The model list comes from the agent process; load it when needed.
  useEffect(() => {
    if (open && models.length === 0 && isDesktop()) void refresh(agent);
  }, [open, agent, models.length, refresh]);

  const effective = model || currentModel[agent] || "";
  const modelName = effective
    ? (models.find((m) => m.value === effective)?.name ?? effective)
    : "Default model";

  const pickAgent = (k: AgentKind) => {
    if (chat) setChatAgent(chat.id, k);
    else setDefaultAgent(k);
  };
  const pickModel = (v: string) => {
    if (chat) setChatModel(chat.id, v);
    else setDefaultModel(agent, v);
  };

  const toggle = () =>
    setRect((r) =>
      r ? null : (btnRef.current?.getBoundingClientRect() ?? null),
    );

  const header = (
    <div className="flex flex-col gap-1.5">
      <AgentSwitch value={agent} onChange={pickAgent} disabled={locked} />
      {locked && (
        <p className="px-1 text-[10.5px] text-ink-3">
          This chat stays with {AGENTS[agent].name}. Start a new chat to
          switch agents.
        </p>
      )}
    </div>
  );
  const s = setup[agent];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title="Agent and model"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex shrink-0 items-center gap-1.5 rounded-[7px] border border-line bg-panel-2 px-2 text-ink-2 transition-colors duration-150 hover:bg-hover ${
          size === "md" ? "h-8 text-[11.5px]" : "h-7 text-[11.5px]"
        }`}
      >
        <SetupDot kind={agent} />
        <span className="max-w-[190px] truncate">
          <span className="text-ink">{AGENTS[agent].name}</span>
          <span className="text-ink-3"> · {modelName}</span>
        </span>
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
                        className={`absolute right-0 flex w-[300px] flex-col gap-2 rounded-[10px] border border-line bg-panel p-2 shadow-[0_16px_48px_var(--color-shadow)] ${
                          placement === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5"
                        }`}
                      >
                        {header}
                        <p className="px-1 pb-1 text-[12px] leading-relaxed text-ink-3">
                          {!isDesktop()
                            ? "Agents run in the desktop app, on your machine."
                            : s?.hint
                              ? s.hint
                              : `Loading models from ${AGENTS[agent].name}… The default model works right away.`}
                        </p>
                      </div>
                    ) : (
                      <ModelPicker
                        models={models}
                        active={model}
                        placement={placement}
                        header={header}
                        note={NOTE[agent]}
                        onPick={pickModel}
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
