import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Lightning } from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { askAgent } from "@/lib/agent-actions";
import { DOC_ACTIONS, docContext } from "@/lib/agent-context";
import type { Doc } from "@/lib/types";
import { ModelSelect } from "@/components/agents/model-select";

/**
 * Dropdown under the editor's "Ask agent" button: free-form instruction
 * plus one-click actions. Hands the page to the agent with its file path
 * as hidden context, so the agent edits the real file.
 */
export function AskAgentPopover({
  doc,
  open,
  onClose,
}: {
  doc: Doc;
  open: boolean;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Ask agent"
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-40 mt-1.5 w-[380px] origin-top-right rounded-[12px] border border-line bg-panel shadow-[0_16px_48px_var(--color-shadow)]"
          >
            <AskAgentBody doc={doc} onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function AskAgentBody({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const folders = useWorkspace((s) => s.folders);
  const [text, setText] = useState("");
  const title = doc.title.trim() || "Untitled";

  const run = (prompt: string, label: string) => {
    onClose();
    askAgent({
      prompt,
      context: docContext(doc, folders),
      title: `${label} · ${title}`,
      stay: true,
    });
  };

  return (
    <>
      <div className="border-b border-line-soft p-2.5">
        <div className="flex items-center gap-2 rounded-[8px] border border-line bg-panel-2 px-2.5 focus-within:border-accent-line">
          <Lightning size={14} className="shrink-0 text-accent" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                e.preventDefault();
                run(text.trim(), text.trim().slice(0, 40));
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Tell the agent what to do with this page…"
            aria-label="Instruction for the agent"
            className="h-9 w-full min-w-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          <ModelSelect />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => run(text.trim(), text.trim().slice(0, 40))}
            aria-label="Send to agent"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-accent text-on-accent transition-opacity disabled:opacity-30"
          >
            <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      </div>
      <div className="p-1.5">
        <div className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Quick actions
        </div>
        {DOC_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => run(a.prompt, a.label)}
            className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="border-t border-line-soft px-3 py-2 text-[11px] leading-relaxed text-ink-3">
        The agent edits this page's file directly — changes appear here
        live and can be undone with Ctrl+Z.
      </p>
    </>
  );
}
