import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle,
  Circle,
  FileText,
  Lightning,
  ListBullets,
  User,
  type Icon,
} from "@phosphor-icons/react";
import { useWorkspace, type TaskFilter } from "@/lib/store";
import { dueBucket, extractTasks, isAgentName, isoDay } from "@/lib/tasks";

const FILTERS: { id: TaskFilter; label: string; Icon: Icon }[] = [
  { id: "all", label: "All", Icon: ListBullets },
  { id: "open", label: "Open", Icon: Circle },
  { id: "done", label: "Done", Icon: CheckCircle },
];

const SECTION_LABEL =
  "px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3";

const INDICATOR =
  "absolute inset-y-0 left-0 my-auto h-3.5 w-[2px] rounded-full bg-accent";

/**
 * Sidebar content for the "tasks" rail section: filter rows plus a
 * per-document breakdown. Rendered inside the sidebar's scroll area —
 * no shell of its own.
 */
export function TasksNav() {
  const docs = useWorkspace((s) => s.docs);
  const taskFilter = useWorkspace((s) => s.taskFilter);
  const setTaskFilter = useWorkspace((s) => s.setTaskFilter);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const assignee = useWorkspace((s) => s.taskAssignee);
  const setAssignee = useWorkspace((s) => s.setTaskAssignee);
  const setTaskGroup = useWorkspace((s) => s.setTaskGroup);
  const reduceMotion = useReducedMotion();

  const tasks = extractTasks(docs);
  const openCount = tasks.reduce((n, t) => n + (t.done ? 0 : 1), 0);
  const counts: Record<TaskFilter, number> = {
    all: tasks.length,
    open: openCount,
    done: tasks.length - openCount,
  };

  const today = isoDay(new Date());
  const overdue = tasks.filter(
    (t) => !t.done && dueBucket(t.due, today) === "overdue",
  ).length;
  const dueToday = tasks.filter(
    (t) => !t.done && dueBucket(t.due, today) === "today",
  ).length;

  // Open tasks per @assignee — people and agents side by side.
  const people = new Map<string, { name: string; open: number }>();
  for (const t of tasks) {
    if (t.done) continue;
    for (const a of t.assignees) {
      const key = a.toLowerCase();
      const e = people.get(key) ?? { name: a, open: 0 };
      e.open += 1;
      people.set(key, e);
    }
  }
  const assignees = [...people.entries()].sort((x, y) => y[1].open - x[1].open);

  // Docs that contain at least one task, in doc order.
  const docStats = docs
    .map((doc) => {
      const docTasks = tasks.filter((t) => t.docId === doc.id);
      return {
        doc,
        total: docTasks.length,
        open: docTasks.reduce((n, t) => n + (t.done ? 0 : 1), 0),
      };
    })
    .filter((s) => s.total > 0);

  return (
    <div>
      <section>
        <div className={SECTION_LABEL}>Filter</div>
        {FILTERS.map(({ id, label, Icon: FilterIcon }) => {
          const active = taskFilter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTaskFilter(id)}
              aria-pressed={active}
              className={`relative flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150 ${
                active ? "bg-elev text-ink" : "text-ink-2 hover:bg-hover"
              }`}
            >
              {active &&
                (reduceMotion ? (
                  <span className={INDICATOR} />
                ) : (
                  <motion.span
                    layoutId="tasksnav-active"
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 32,
                    }}
                    className={INDICATOR}
                  />
                ))}
              <FilterIcon size={15} className="shrink-0 text-ink-3" />
              <span className="flex-1 truncate text-left">{label}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                {counts[id]}
              </span>
            </button>
          );
        })}
      </section>

      {(overdue > 0 || dueToday > 0) && (
        <button
          type="button"
          onClick={() => setTaskGroup("due")}
          className="mx-2 mt-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-[8px] border border-line-soft bg-panel-2 px-2.5 py-2 text-left text-[12px] text-ink-2 transition-colors hover:bg-hover"
        >
          {overdue > 0 && (
            <span className="text-danger">{overdue} overdue</span>
          )}
          {overdue > 0 && dueToday > 0 && <span className="text-ink-3">·</span>}
          {dueToday > 0 && (
            <span className="text-accent">{dueToday} due today</span>
          )}
        </button>
      )}

      {assignees.length > 0 && (
        <section className="mt-3">
          <div className={SECTION_LABEL}>People & agents</div>
          {assignees.map(([key, { name, open }]) => {
            const active = assignee === key;
            const AIcon = isAgentName(name) ? Lightning : User;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setAssignee(active ? null : key)}
                aria-pressed={active}
                className={`relative flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150 ${
                  active ? "bg-elev text-ink" : "text-ink-2 hover:bg-hover"
                }`}
              >
                {active && <span className={INDICATOR} />}
                <AIcon
                  size={15}
                  className={`shrink-0 ${
                    isAgentName(name) ? "text-accent" : "text-ink-3"
                  }`}
                />
                <span className="flex-1 truncate text-left">@{name}</span>
                <span className="font-mono text-[11px] text-ink-3">{open}</span>
              </button>
            );
          })}
        </section>
      )}

      {tasks.length === 0 && (
        <div className="px-2 pt-1 text-[12px] text-ink-3">No tasks yet</div>
      )}

      {docStats.length > 0 && (
        <section className="mt-3">
          <div className={SECTION_LABEL}>By document</div>
          {docStats.map(({ doc, total, open }) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setActiveDoc(doc.id)}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-hover"
            >
              <FileText size={15} className="shrink-0 text-ink-3" />
              <span className="flex-1 truncate text-left">
                {doc.title.trim() === "" ? "Untitled" : doc.title}
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                {open}/{total}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
