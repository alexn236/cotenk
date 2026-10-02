import { useWorkspace } from "./store";
import { askAgent } from "./agent-actions";
import { docContext } from "./agent-context";
import { agentForHandle } from "./agents";
import {
  setTaskDueAtLine,
  setTaskRepeatAtLine,
  toggleTaskAtLine,
  type Repeat,
  type TaskItem,
} from "./tasks";

/** Flips a task's checkbox in its source doc. */
export function toggleTask(task: TaskItem, done: boolean) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  st.updateDocContent(doc.id, toggleTaskAtLine(doc.content, task.lineIndex, done));
}

/** Sets or clears a task's due date in its source doc. */
export function setTaskDue(task: TaskItem, due: string | null) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  st.updateDocContent(doc.id, setTaskDueAtLine(doc.content, task.lineIndex, due));
}

/** Sets or clears how a task repeats. */
export function setTaskRepeat(task: TaskItem, repeat: Repeat | null) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  st.updateDocContent(doc.id, setTaskRepeatAtLine(doc.content, task.lineIndex, repeat));
}

/** Moves a task to a board column: re-dates it and/or flips done. */
export function moveTask(task: TaskItem, done: boolean, due: string | null | undefined) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  let content = doc.content;
  if (done !== task.done) content = toggleTaskAtLine(content, task.lineIndex, done);
  if (due !== undefined) content = setTaskDueAtLine(content, task.lineIndex, due);
  if (content !== doc.content) st.updateDocContent(doc.id, content);
}

/**
 * Hands a task to an agent — the one it is assigned to (`@claude`,
 * `@devin`), else the default. It works in the workspace and checks the
 * task off in the page when finished — people see it complete in Tasks.
 */
export function delegateTask(task: TaskItem) {
  const st = useWorkspace.getState();
  const doc = st.docs.find((d) => d.id === task.docId);
  if (!doc) return;
  const agent =
    task.assignees.map(agentForHandle).find((a) => a !== null) ?? undefined;
  askAgent({
    // Same recipe as in the workspace skill (cotenk-skill.md).
    prompt: `Please take care of this task: "${task.text}".\n\nWhen it is done, mark it complete by changing its "- [ ]" to "- [x]" in the page, and add one note line directly below it ("  - Done: …") saying what you did or where the result is. If you can't finish, leave it unticked and add "  - Blocked: <reason>" instead.`,
    context: docContext(doc, st.folders),
    title: task.text,
    agent,
    stay: true,
  });
}
