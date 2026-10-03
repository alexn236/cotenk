import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckSquare,
  FileText,
  Kanban,
  ListChecks,
  Plus,
  X,
} from "@phosphor-icons/react";
import {
  useWorkspace,
  type TaskFilter,
  type TaskGroup,
  type TaskView,
} from "@/lib/store";
import {
  appendTask,
  dueBucket,
  extractTasks,
  isoDay,
  type DueBucket,
  type TaskItem,
} from "@/lib/tasks";
import { TaskRow } from "./task-row";
import { TaskBoard } from "./task-board";
import { useSuggest } from "@/components/ui/use-suggest";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const EMPTY_STATE: Record<TaskFilter, { title: string; sub: string }> = {
  all: {
    title: "No tasks",
    sub: "Add one above or write - [ ] in any page.",
  },
  open: {
    title: "All clear",
    sub: "No open tasks across your pages.",
  },
  done: {
    title: "Nothing done yet",
    sub: "Completed tasks will land here.",
  },
};

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
  none: "No date",
};
const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "week", "later", "none"];

type Group = {
  key: string;
  label: string;
  docId?: string;
  tone?: "danger" | "accent";
  items: TaskItem[];
};

/**
 * Cross-document task list. Collects every `- [ ]` / `- [x]` item from all
 * pages, groups them by page or due date and writes toggles back into the
 * page source. Tasks can be handed to the agent from each row.
 */
export function TasksView() {
  const docs = useWorkspace((s) => s.docs);
  const taskFilter = useWorkspace((s) => s.taskFilter);
  const taskGroup = useWorkspace((s) => s.taskGroup);
  const setTaskGroup = useWorkspace((s) => s.setTaskGroup);
  const taskView = useWorkspace((s) => s.taskView);
  const setTaskView = useWorkspace((s) => s.setTaskView);
  const assignee = useWorkspace((s) => s.taskAssignee);
  const setAssignee = useWorkspace((s) => s.setTaskAssignee);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const createDocWith = useWorkspace((s) => s.createDocWith);
  const updateDocContent = useWorkspace((s) => s.updateDocContent);
  const setRailSection = useWorkspace((s) => s.setRailSection);

  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState("");
  const today = isoDay(new Date());

  const tasks = extractTasks(docs);
  const openCount = tasks.reduce((n, t) => n + (t.done ? 0 : 1), 0);

  // The board shows open and done side by side — only the person filter
  // applies there.
  const byAssignee = tasks.filter(
    (t) => !assignee || t.assignees.some((a) => a.toLowerCase() === assignee),
  );
  const filtered = tasks.filter(
    (t) =>
      (taskFilter === "all" ? true : taskFilter === "open" ? !t.done : t.done) &&
      (!assignee || t.assignees.some((a) => a.toLowerCase() === assignee)),
  );

  const groups: Group[] = [];
  if (taskGroup === "page") {
    const byDoc = new Map<string, Group>();
    for (const t of filtered) {
      let g = byDoc.get(t.docId);
      if (!g) {
        g = {
          key: t.docId,
          label: t.docTitle.trim() || "Untitled",
          docId: t.docId,
          items: [],
        };
        byDoc.set(t.docId, g);
        groups.push(g);
      }
      g.items.push(t);
    }
  } else {
    for (const b of BUCKET_ORDER) {
      const items = filtered
        .filter((t) => dueBucket(t.due, today) === b)
        .sort((x, y) => (x.due ?? "").localeCompare(y.due ?? ""));
      if (items.length > 0) {
        groups.push({
          key: b,
          label: BUCKET_LABEL[b],
          tone: b === "overdue" ? "danger" : b === "today" ? "accent" : undefined,
          items,
        });
      }
    }
  }

  // Quick-add lands in the "Inbox" page; it is created on first use and
  // the user stays in Tasks.
  const addTask = (text: string) => {
    const inbox = docs.find((d) => d.title.trim().toLowerCase() === "inbox");
    if (!inbox) {
      createDocWith({ title: "Inbox", content: `- [ ] ${text}` });
      setRailSection("tasks");
    } else {
      updateDocContent(inbox.id, appendTask(inbox.content, text));
    }
  };

  const draftRef = useRef<HTMLInputElement | null>(null);
  // "@" suggests people and agents, "due:" dates, "[[" pages.
  const suggest = useSuggest({
    ref: draftRef,
    value: draft,
    onChange: setDraft,
    mode: "page",
  });

  const onQuickAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggest.onKeyDown(e)) return;
    if (e.key === "Enter") {
      const text = draft.trim();
      if (text !== "") {
        addTask(text);
        setDraft("");
      }
    } else if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  };

  const empty = EMPTY_STATE[taskFilter];
  let seq = 0;

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas">
      {/* top bar */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        <span className="text-[13px] font-semibold text-ink">Tasks</span>
        <span className="font-mono text-[11.5px] text-ink-3">
          {openCount} open
        </span>
        {assignee && (
          <button
            type="button"
            onClick={() => setAssignee(null)}
            className="inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent-dim px-2 py-0.5 text-[11px] text-accent"
          >
            @{assignee}
            <X size={10} />
          </button>
        )}
        <div
          role="radiogroup"
          aria-label="Task view"
          className="ml-auto flex items-center rounded-[7px] border border-line bg-panel p-0.5"
        >
          {(["list", "board"] as TaskView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={taskView === v}
              onClick={() => setTaskView(v)}
              className={`flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11.5px] transition-colors duration-150 ${
                taskView === v
                  ? "bg-elev text-ink"
                  : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {v === "list" ? <ListChecks size={12} /> : <Kanban size={12} />}
              {v === "list" ? "List" : "Board"}
            </button>
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label="Group tasks"
          className={`flex items-center rounded-[7px] border border-line bg-panel p-0.5 ${
            taskView === "board" ? "hidden" : ""
          }`}
        >
          {(["page", "due"] as TaskGroup[]).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={taskGroup === g}
              onClick={() => setTaskGroup(g)}
              className={`h-6 rounded-[5px] px-2.5 text-[11.5px] transition-colors duration-150 ${
                taskGroup === g
                  ? "bg-elev text-ink"
                  : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {g === "page" ? "By page" : "By date"}
            </button>
          ))}
        </div>
      </header>

      {/* task list */}
      <div className="flex-1 overflow-y-auto">
        <div
          className={
            taskView === "board"
              ? "w-full px-6 py-8"
              : "mx-auto w-full max-w-[760px] px-6 py-10 md:px-14"
          }
        >
          {/* quick add */}
          <div className="flex h-10 items-center gap-2.5 rounded-[10px] border border-line-soft bg-panel px-3 focus-within:border-accent-line">
            <Plus size={15} className="shrink-0 text-ink-3" />
            <input
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={onQuickAddKeyDown}
              {...suggest.fieldProps}
              placeholder="Add a task — @who, due: and [[page]] are suggested — lands in Inbox"
              aria-label="Add a task"
              spellCheck={false}
              className="flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
            />
            {suggest.menu}
          </div>

          {taskView === "board" ? (
            <div className="mt-6">
              <TaskBoard tasks={byAssignee} today={today} />
            </div>
          ) : groups.length === 0 ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              className="flex flex-col items-center py-16"
            >
              <CheckSquare size={24} className="text-ink-3" />
              <p className="mt-3 text-sm text-ink-2">{empty.title}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{empty.sub}</p>
            </motion.div>
          ) : (
            <div className="mt-6">
              {groups.map((group) => (
                <section key={group.key} className="mt-6 first:mt-0">
                  <button
                    type="button"
                    disabled={!group.docId}
                    onClick={() => group.docId && setActiveDoc(group.docId)}
                    className="group/hdr mb-1 flex max-w-full items-center gap-1.5 px-2 text-left disabled:cursor-default"
                  >
                    {group.docId && (
                      <FileText
                        size={13}
                        className="shrink-0 text-ink-3 transition-colors duration-150 group-hover/hdr:text-ink-2"
                      />
                    )}
                    <span
                      className={`min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 ${
                        group.tone === "danger"
                          ? "text-danger"
                          : group.tone === "accent"
                            ? "text-accent"
                            : "text-ink-3"
                      }`}
                    >
                      {group.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {group.items.length}
                    </span>
                  </button>
                  {group.items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      seq={seq++}
                      showDoc={taskGroup === "due"}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
