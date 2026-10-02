import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowsClockwise, CalendarBlank, CalendarPlus } from "@phosphor-icons/react";
import { setTaskDue, setTaskRepeat } from "@/lib/task-actions";
import {
  addDays,
  dueBucket,
  formatDue,
  isoDay,
  nextFriday,
  REPEATS,
  REPEAT_LABEL,
  type TaskItem,
} from "@/lib/tasks";

const CHIP =
  "inline-flex h-[18px] items-center gap-1 rounded-full border px-1.5 text-[10.5px] leading-none";

const ITEM =
  "flex h-7 w-full items-center justify-between gap-3 rounded-[6px] px-2 text-left text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink";

/**
 * Due date + repeat of a task as chips; clicking opens a small menu with
 * quick dates, a date picker and the repeat rule.
 */
export function TaskSchedule({ task, today }: { task: TaskItem; today: string }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const bucket = dueBucket(task.due, today);

  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const flip = r.bottom + 330 > window.innerHeight;
    setPos({
      left: Math.max(8, Math.min(Math.round(r.left), window.innerWidth - 228)),
      top: flip ? Math.max(8, Math.round(r.top) - 326) : Math.round(r.bottom) + 4,
    });
  };
  const close = () => setPos(null);
  const pick = (due: string | null) => {
    setTaskDue(task, due);
    close();
  };

  const tone = task.done
    ? "border-line-soft text-ink-3"
    : bucket === "overdue"
      ? "border-danger/40 text-danger"
      : bucket === "today"
        ? "border-accent-line text-accent"
        : "border-line text-ink-2";

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={open}
        title="Change date or repeat"
        aria-haspopup="menu"
        className={`${CHIP} transition-colors hover:bg-hover ${
          task.due || task.repeat
            ? tone
            : "border-transparent text-ink-3 opacity-0 focus-visible:opacity-100 group-focus-within/task:opacity-100 group-hover/task:opacity-100"
        }`}
      >
        {task.due ? <CalendarBlank size={10} /> : task.repeat ? null : <CalendarPlus size={10} />}
        {task.due ? formatDue(task.due, today) : task.repeat ? null : "Add date"}
        {task.repeat && (
          <span className="inline-flex items-center gap-0.5" title={REPEAT_LABEL[task.repeat]}>
            <ArrowsClockwise size={10} />
            {task.due ? null : REPEAT_LABEL[task.repeat].replace("Every ", "")}
          </span>
        )}
      </button>

      {pos &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <div className="fixed inset-0 z-40" onClick={close} onWheel={close} />
            <div
              role="menu"
              style={{ left: pos.left, top: pos.top }}
              className="fixed z-50 w-[220px] rounded-[8px] border border-line bg-elev p-1 shadow-[0_8px_24px_var(--color-shadow)]"
            >
              <button type="button" role="menuitem" className={ITEM} onClick={() => pick(today)}>
                Today
              </button>
              <button
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => pick(addDays(today, 1))}
              >
                Tomorrow
              </button>
              <button
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => pick(nextFriday(today))}
              >
                This Friday
              </button>
              <button
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => pick(addDays(today, 7))}
              >
                In a week
              </button>
              <label className={`${ITEM} relative cursor-pointer`}>
                Pick a date…
                <input
                  ref={picker}
                  type="date"
                  value={task.due ?? ""}
                  min={isoDay(new Date(2000, 0, 1))}
                  onChange={(e) => e.currentTarget.value && pick(e.currentTarget.value)}
                  className="h-5 w-[118px] cursor-pointer rounded-[4px] border border-line bg-panel-2 px-1 text-[11px] text-ink outline-none"
                />
              </label>
              {task.due && (
                <button
                  type="button"
                  role="menuitem"
                  className={`${ITEM} hover:!text-danger`}
                  onClick={() => pick(null)}
                >
                  Remove date
                </button>
              )}
              <div className="my-1 h-px bg-line-soft" />
              <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                Repeat
              </div>
              {REPEATS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="menuitem"
                  className={ITEM}
                  onClick={() => {
                    setTaskRepeat(task, r);
                    close();
                  }}
                >
                  {REPEAT_LABEL[r]}
                  {task.repeat === r && <span className="text-accent">●</span>}
                </button>
              ))}
              {task.repeat && (
                <button
                  type="button"
                  role="menuitem"
                  className={`${ITEM} hover:!text-danger`}
                  onClick={() => {
                    setTaskRepeat(task, null);
                    close();
                  }}
                >
                  Don't repeat
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
