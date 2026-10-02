import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Lightning, Square, Warning } from "@phosphor-icons/react";
import { useActiveChat, useAgent } from "@/lib/agent-store";
import { useWorkspace } from "@/lib/store";
import { AGENTS } from "@/lib/agents";
import { usePermissions } from "@/lib/agent-permissions";

/**
 * Floating status pill shown outside the Agents view while an agent turn
 * runs (or just failed): what it is doing right now, stop, jump to chat.
 * Lets people keep working on a page while the agent edits it.
 */
export function AgentActivity() {
  const status = useAgent((s) => s.status);
  const error = useAgent((s) => s.error);
  const stop = useAgent((s) => s.stop);
  const selectChat = useAgent((s) => s.selectChat);
  const runningChat = useAgent((s) =>
    s.runningChatId
      ? (s.chats.find((c) => c.id === s.runningChatId) ?? null)
      : null,
  );
  const activeChat = useActiveChat();
  const chat = runningChat ?? activeChat;
  const rail = useWorkspace((s) => s.railSection);
  const setRail = useWorkspace((s) => s.setRailSection);
  const reduceMotion = useReducedMotion();
  const waiting = usePermissions((s) => s.queue.length > 0);

  const running = status === "running" || status === "starting";
  const failed = status === "error" && !!error;
  const visible = rail !== "agents" && (running || failed);
  const name = chat ? AGENTS[chat.agent].name : "Agent";

  // Latest tool call is the most honest "what is it doing" line.
  const lastTool = chat?.messages.filter((m) => m.role === "tool").at(-1)
    ?.text;
  const line = failed
    ? error
    : waiting
      ? "Waiting for your approval"
      : status === "starting"
      ? "Starting…"
      : (lastTool ?? "Thinking…");

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="agent-activity"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-16 left-1/2 z-[55] flex max-w-[520px] -translate-x-1/2 items-center gap-2.5 rounded-full border border-line bg-elev py-1.5 pl-3 pr-1.5 text-[12px] shadow-[0_12px_36px_var(--color-shadow)]"
        >
          {failed ? (
            <Warning size={14} className="shrink-0 text-danger" />
          ) : (
            <span className="relative grid h-4 w-4 shrink-0 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
              <Lightning size={12} weight="fill" className="relative text-accent" />
            </span>
          )}
          <span className="shrink-0 font-medium text-ink">
            {failed ? `${name} stopped` : `${name} working`}
          </span>
          <span className="min-w-0 truncate font-mono text-[11px] text-ink-3">
            {line}
          </span>
          {running && (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop agent"
              title="Stop"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-danger"
            >
              <Square size={10} weight="fill" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (chat) selectChat(chat.id);
              setRail("agents");
            }}
            className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-panel-2 px-2.5 text-[11.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            Open chat
            <ArrowRight size={11} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
