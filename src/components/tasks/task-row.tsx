import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  FileText,
  Lightning,
  User,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { delegateTask, toggleTask } from "@/lib/task-actions";
import { isAgentName, type TaskItem } from "@/lib/tasks";
import { TaskSchedule } from "./task-schedule";

const CHIP =
  "inline-flex h-[18px] items-center gap-1 rounded-full border px-1.5 text-[10.5px] leading-none";

/**
 * One task line: checkbox, text, due/assignee chips and hover actions
 * (hand to agent, open the source page).
 */
export function TaskRow({
  task,
  today,
  seq = 0,
  showDoc = false,
}: {
  task: TaskItem;
  /** YYYY-MM-DD, for due chips. */
  today: string;
  seq?: number;
  showDoc?: boolean;
}) {
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: Math.min(seq * 0.03, 0.25),
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group/task flex items-start gap-2.5 rounded-[8px] px-2 py-1.5 transition-colors duration-150 hover:bg-panel"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.text}
        onClick={() => toggleTask(task, !task.done)}
        className={`mt-[3px] grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors duration-150 ${
          task.done
            ? "border-accent bg-accent text-on-accent"
            : "border-line bg-panel-2 hover:border-ink-3"
        }`}
      >
        {task.done && <Check size={10} weight="bold" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`text-[13.5px] leading-[1.5] ${
            task.done
              ? "text-ink-3 line-through decoration-ink-3"
              : "text-ink"
          }`}
        >
          {task.text}
        </span>
        <TaskSchedule task={task} today={today} />
        {task.assignees.map((a) => (
          <span
            key={a}
            className={`${CHIP} ${
              isAgentName(a)
                ? "border-accent-line bg-accent-dim text-accent"
                : "border-line text-ink-2"
            }`}
          >
            {isAgentName(a) ? (
              <Lightning size={10} weight="fill" />
            ) : (
              <User size={10} />
            )}
            {a}
          </span>
        ))}
        {showDoc && (
          <span className={`${CHIP} border-transparent text-ink-3`}>
            <FileText size={10} />
            {task.docTitle.trim() || "Untitled"}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/task:opacity-100 group-hover/task:opacity-100">
        {!task.done && (
          <button
            type="button"
            onClick={() => delegateTask(task)}
            aria-label="Hand to agent"
            title="Hand to agent"
            className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover hover:text-accent"
          >
            <Lightning size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveDoc(task.docId)}
          aria-label={`Open ${task.docTitle}`}
          title="Open page"
          className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
        >
          <ArrowUpRight size={13} />
        </button>
      </div>
    </motion.div>
  );
}
