import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  CalendarBlank,
  Check,
  FileText,
  Lightning,
  User,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { delegateTask, moveTask, toggleTask } from "@/lib/task-actions";
import {
  addDays,
  dueBucket,
  formatDue,
  isAgentName,
  nextFriday,
  type DueBucket,
  type TaskItem,
} from "@/lib/tasks";

type ColumnId = DueBucket | "done";

const COLUMNS: { id: ColumnId; label: string; hint: string }[] = [
  { id: "overdue", label: "Overdue", hint: "" },
  { id: "today", label: "Today", hint: "due today" },
  { id: "week", label: "Next 7 days", hint: "due Friday" },
  { id: "later", label: "Later", hint: "due in two weeks" },
  { id: "none", label: "No date", hint: "date removed" },
  { id: "done", label: "Done", hint: "ticked off" },
];

const DRAG_TYPE = "application/x-cotenk-task";

/**
 * Kanban view of the task list: open tasks in due-date columns plus a
 * Done column. Dragging a card re-dates the task (or ticks it off) in
 * its source page — the board is just another view of the markdown.
 */
export function TaskBoard({ tasks, today }: { tasks: TaskItem[]; today: string }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ColumnId | null>(null);

  const columnOf = (t: TaskItem): ColumnId => (t.done ? "done" : dueBucket(t.due, today));

  const drop = (col: ColumnId) => {
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    setOver(null);
    if (!task || columnOf(task) === col || col === "overdue") return;
    if (col === "done") {
      moveTask(task, true, undefined);
      return;
    }
    const due =
      col === "today"
        ? today
        : col === "week"
          ? nextFriday(today)
          : col === "later"
            ? addDays(today, 14)
            : null;
    moveTask(task, false, due);
  };

  return (
    <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const items = tasks
          .filter((t) => columnOf(t) === col.id)
          .sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
        const dropping = over === col.id && dragId !== null && col.id !== "overdue";
        if (col.id === "overdue" && items.length === 0) return null;
        return (
          <section
            key={col.id}
            onDragOver={(e) => {
              if (!Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) return;
              if (col.id === "overdue") return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(col.id);
            }}
            className={`flex w-[232px] shrink-0 flex-col rounded-[12px] border p-2 transition-colors duration-150 ${
              dropping ? "border-accent-line bg-accent-dim" : "border-line-soft bg-panel"
            }`}
          >
            <header className="flex items-center gap-1.5 px-1.5 pb-2 pt-1">
              <span
                className={`text-[11px] font-medium uppercase tracking-[0.08em] ${
                  col.id === "overdue"
                    ? "text-danger"
                    : col.id === "today"
                      ? "text-accent"
                      : "text-ink-3"
                }`}
              >
                {col.label}
              </span>
              <span className="font-mono text-[11px] text-ink-3">{items.length}</span>
              {dropping && col.hint && (
                <span className="ml-auto text-[10.5px] text-accent">{col.hint}</span>
              )}
            </header>
            <div className="flex flex-1 flex-col gap-1.5">
              {items.slice(0, col.id === "done" ? 40 : 200).map((t, i) => (
                <Card
                  key={t.id}
                  task={t}
                  today={today}
                  seq={i}
                  dragging={dragId === t.id}
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                />
              ))}
              {items.length === 0 && (
                <p className="rounded-[8px] border border-dashed border-line px-2 py-3 text-center text-[11.5px] text-ink-3">
                  Drop tasks here
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  task,
  today,
  seq,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: TaskItem;
  today: string;
  seq: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const reduceMotion = useReducedMotion();
  const bucket = dueBucket(task.due, today);
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: dragging ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.24, delay: Math.min(seq * 0.02, 0.2), ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, task.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className="group/card cursor-grab rounded-[9px] border border-line-soft bg-panel-2 px-2.5 py-2 shadow-[0_1px_2px_var(--color-shadow)] transition-colors duration-150 hover:border-line active:cursor-grabbing"
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={task.done}
            aria-label={task.text}
            onClick={() => toggleTask(task, !task.done)}
            className={`mt-[2px] grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors duration-150 ${
              task.done
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-panel hover:border-ink-3"
            }`}
          >
            {task.done && <Check size={9} weight="bold" />}
          </button>
          <span
            className={`min-w-0 flex-1 text-[12.5px] leading-[1.45] [overflow-wrap:anywhere] ${
              task.done ? "text-ink-3 line-through decoration-ink-3" : "text-ink"
            }`}
          >
            {task.text}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[22px]">
          {task.due && (
            <span
              className={`inline-flex h-[17px] items-center gap-1 rounded-full border px-1.5 text-[10px] ${
                task.done
                  ? "border-line-soft text-ink-3"
                  : bucket === "overdue"
                    ? "border-danger/40 text-danger"
                    : bucket === "today"
                      ? "border-accent-line text-accent"
                      : "border-line text-ink-2"
              }`}
            >
              <CalendarBlank size={9} />
              {formatDue(task.due, today)}
            </span>
          )}
          {task.assignees.map((a) => (
            <span
              key={a}
              className={`inline-flex h-[17px] items-center gap-1 rounded-full border px-1.5 text-[10px] ${
                isAgentName(a)
                  ? "border-accent-line bg-accent-dim text-accent"
                  : "border-line text-ink-2"
              }`}
            >
              {isAgentName(a) ? <Lightning size={9} weight="fill" /> : <User size={9} />}
              {a}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setActiveDoc(task.docId)}
            title="Open page"
            className="inline-flex h-[17px] min-w-0 items-center gap-1 rounded-full px-1 text-[10px] text-ink-3 hover:text-ink-2"
          >
            <FileText size={9} />
            <span className="max-w-[110px] truncate">{task.docTitle.trim() || "Untitled"}</span>
            <ArrowUpRight size={9} className="opacity-0 group-hover/card:opacity-100" />
          </button>
          {!task.done && (
            <button
              type="button"
              onClick={() => delegateTask(task)}
              aria-label="Hand to agent"
              title="Hand to agent"
              className="ml-auto grid h-5 w-5 place-items-center rounded-[5px] text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-accent group-hover/card:opacity-100"
            >
              <Lightning size={11} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
