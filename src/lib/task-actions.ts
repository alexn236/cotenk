import { useWorkspace } from "./store";
import { askAgent } from "./agent-actions";
import { docContext } from "./agent-context";
import { toggleTaskAtLine, type TaskItem } from "./tasks";

/** Flips a task's checkbox in its source doc. */
export function toggleTask(task: TaskItem, done: boolean) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  st.updateDocContent(doc.id, toggleTaskAtLine(doc.content, task.lineIndex, done));
}

/**
 * Hands a task to the agent. It works in the workspace and checks the
 * task off in the page when finished — people see it complete in Tasks.
 */
export function delegateTask(task: TaskItem) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  askAgent({
    prompt: `Please take care of this task: "${task.text}".\n\nWhen it is done, mark it complete by changing its "- [ ]" to "- [x]" in the page, and add a short note under the task (indented bullet) describing what you did or where the result is.`,
    context: docContext(doc, st.folders),
    title: task.text,
    stay: true,
  });
}
