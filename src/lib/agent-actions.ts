import { useAgent } from "./agent-store";
import type { AgentKind } from "./agents";
import { useWorkspace } from "./store";
import { toast } from "./toast";
import { DESKTOP_ONLY_MESSAGE, isDesktop } from "./workspace";

/**
 * Hands work from anywhere in the workspace (a page, a task, the
 * marketplace builder) to the agent: opens a fresh chat, switches to the
 * Agents view (unless `stay`) and sends the prompt with its hidden context.
 */
export function askAgent({
  prompt,
  context,
  title,
  agent: kind,
  stay = false,
}: {
  prompt: string;
  context?: string;
  title?: string;
  /** Which agent; defaults to the one picked last. */
  agent?: AgentKind;
  /** Keep the current view (e.g. watch a page change live). */
  stay?: boolean;
}) {
  if (!isDesktop()) {
    toast(DESKTOP_ONLY_MESSAGE, { tone: "error" });
    return;
  }
  const agent = useAgent.getState();
  if (agent.status === "running" || agent.status === "starting") {
    toast("An agent is still working on another request — wait or stop it first.", {
      tone: "error",
    });
    return;
  }
  agent.newChat(null, kind);
  const chatId = useAgent.getState().activeChatId;
  if (chatId && title) agent.renameChat(chatId, title.slice(0, 60));
  if (!stay) useWorkspace.getState().setRailSection("agents");
  void useAgent.getState().send(prompt, { context });
}
