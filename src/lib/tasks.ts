import type { Doc } from "./types";

export type TaskItem = {
  /** `${docId}:${lineIndex}` — stable while the line exists. */
  id: string;
  docId: string;
  docTitle: string;
  /** Index of the `- [ ]` line inside the doc's content. */
  lineIndex: number;
  /** Task text with the @assignee / due: markers stripped. */
  text: string;
  /** Raw task text exactly as written in the doc. */
  raw: string;
  done: boolean;
  /** `@name` mentions — people or agents. */
  assignees: string[];
  /** Local-date string YYYY-MM-DD, or null. */
  due: string | null;
  /** `every:week` etc. — a new copy appears when it's completed. */
  repeat: Repeat | null;
};

export type Repeat = "day" | "weekday" | "week" | "month" | "year";
export const REPEATS: Repeat[] = ["day", "weekday", "week", "month", "year"];
export const REPEAT_LABEL: Record<Repeat, string> = {
  day: "Every day",
  weekday: "Every weekday",
  week: "Every week",
  month: "Every month",
  year: "Every year",
};

const DUE_RE = /(?:^|\s)(?:due:|📅\s?)(\d{4}-\d{2}-\d{2})\b/;
const REPEAT_RE = /(?:^|\s)every:(day|weekday|week|month|year)\b/i;
const MENTION_RE = /(?:^|\s)@([\p{L}\p{N}_.-]+)/gu;

/** Splits the inline task markers off the visible text. */
export function parseTaskMeta(raw: string): {
  text: string;
  assignees: string[];
  due: string | null;
  repeat: Repeat | null;
} {
  const due = DUE_RE.exec(raw)?.[1] ?? null;
  const repeat = (REPEAT_RE.exec(raw)?.[1]?.toLowerCase() as Repeat | undefined) ?? null;
  const assignees = [...raw.matchAll(MENTION_RE)].map((m) => m[1]);
  const text = raw
    .replace(DUE_RE, " ")
    .replace(REPEAT_RE, " ")
    .replace(MENTION_RE, " ")
    // Inline markdown reads as noise in plain task lists.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)(.+?)\1/g, "$2")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: text || raw.trim(), assignees, due, repeat };
}

function advance(day: string, repeat: Repeat): string {
  const d = new Date(`${day}T00:00:00`);
  switch (repeat) {
    case "day":
      d.setDate(d.getDate() + 1);
      break;
    case "weekday":
      do d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case "week":
      d.setDate(d.getDate() + 7);
      break;
    case "month": {
      const dom = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(dom, last));
      break;
    }
    case "year":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return isoDay(d);
}

/**
 * Text of the next copy of a repeating task: same text, due date moved to
 * the next occurrence after `today`. Null when the task doesn't repeat.
 */
export function nextRepeatText(text: string, today: string): string | null {
  const repeat = REPEAT_RE.exec(text)?.[1]?.toLowerCase() as Repeat | undefined;
  if (!repeat) return null;
  const due = DUE_RE.exec(text)?.[1] ?? today;
  let next = advance(due, repeat);
  for (let i = 0; next <= today && i < 400; i++) next = advance(next, repeat);
  const marker = `due:${next}`;
  return DUE_RE.test(text)
    ? text.replace(DUE_RE, (m) => `${m.startsWith(" ") ? " " : ""}${marker}`)
    : `${text.replace(/\s+$/, "")} ${marker}`;
}

/** @names that refer to agents rather than people. */
const AGENT_NAMES = new Set([
  "agent",
  "ai",
  "devin",
  "claude",
  "codex",
  "gemini",
  "copilot",
  "cursor",
]);

export const isAgentName = (name: string) =>
  AGENT_NAMES.has(name.toLowerCase());

/** YYYY-MM-DD for a local date. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export function dueBucket(due: string | null, today: string): DueBucket {
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const t = new Date(`${today}T00:00:00`);
  t.setDate(t.getDate() + 7);
  return due <= isoDay(t) ? "week" : "later";
}

/** "Today", "Tomorrow", "Mon 28", "Oct 3" … relative to `today`. */
export function formatDue(due: string, today: string): string {
  if (due === today) return "Today";
  const d = new Date(`${due}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) {
    const wd = d.toLocaleDateString("en-US", { weekday: "short" });
    return `${wd} ${d.getDate()}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TASK_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Collects every markdown task item across all docs (skips fenced code). */
export function extractTasks(docs: Doc[]): TaskItem[] {
  const tasks: TaskItem[] = [];
  for (const doc of docs) {
    let inFence = false;
    doc.content.split("\n").forEach((line, i) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      const m = TASK_RE.exec(line);
      if (m) {
        const raw = m[2].trim();
        tasks.push({
          id: `${doc.id}:${i}`,
          docId: doc.id,
          docTitle: doc.title,
          lineIndex: i,
          raw,
          done: m[1].toLowerCase() === "x",
          ...parseTaskMeta(raw),
        });
      }
    });
  }
  return tasks;
}

/** Returns doc content with the task marker at lineIndex flipped. */
export function toggleTaskAtLine(
  content: string,
  lineIndex: number,
  done: boolean,
): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  const m = line === undefined ? null : TASK_RE.exec(line);
  if (line === undefined || !m) return content;
  lines[lineIndex] = line.replace(/\[[ xX]\]/, `[${done ? "x" : " "}]`);
  // Completing a repeating task adds the next one right below it.
  const next = done && m[1] === " " ? nextRepeatText(m[2], isoDay(new Date())) : null;
  if (next) {
    lines.splice(lineIndex + 1, 0, line.replace(m[2], next).replace(/\[[ xX]\]/, "[ ]"));
  }
  return lines.join("\n");
}

/** Sets (or with null removes) the `every:` marker of a task line. */
export function setTaskRepeatAtLine(
  content: string,
  lineIndex: number,
  repeat: Repeat | null,
): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (line === undefined || !TASK_RE.test(line)) return content;
  const stripped = line.replace(/\s*every:(?:day|weekday|week|month|year)\b/gi, "");
  lines[lineIndex] = repeat ? `${stripped.replace(/\s+$/, "")} every:${repeat}` : stripped;
  return lines.join("\n");
}

/**
 * Returns doc content with the task at lineIndex re-dated: an existing
 * `due:` marker is replaced (or removed for `due === null`), otherwise
 * one is appended.
 */
export function setTaskDueAtLine(
  content: string,
  lineIndex: number,
  due: string | null,
): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (line === undefined || !TASK_RE.test(line)) return content;
  const stripped = line.replace(/\s*(?:due:|📅\s?)\d{4}-\d{2}-\d{2}\b/g, "");
  lines[lineIndex] = due ? `${stripped.replace(/\s+$/, "")} due:${due}` : stripped;
  return lines.join("\n");
}

/** YYYY-MM-DD `days` after `today`. */
export function addDays(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

/** The coming Friday within the next 7 days (a week out on Fridays). */
export function nextFriday(today: string): string {
  const d = new Date(`${today}T00:00:00`);
  const diff = (5 - d.getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

/** Appends a `- [ ] text` line to doc content (keeps a clean newline edge). */
export function appendTask(content: string, text: string): string {
  const line = `- [ ] ${text}`;
  if (content.trim() === "") return line;
  return `${content.replace(/\s+$/, "")}\n${line}`;
}

const DUE_TOKEN_RE = /(^|\s)(?:due:|📅\s?)(\d{4}-\d{2}-\d{2})\b/g;
const REPEAT_TOKEN_RE = /(^|\s)every:(day|weekday|week|month|year)\b/gi;
const MENTION_TOKEN_RE = /(^|\s)@([\p{L}\p{N}_.-]+)/gu;

/**
 * Wraps task markers in inline code (`@devin`, `due:2026-10-01`) so the
 * markdown renderer can draw them as chips. Display-only — the stored
 * source keeps the plain markers.
 */
export function decorateTaskText(text: string): string {
  if (text.includes("`")) return text;
  return text
    .replace(DUE_TOKEN_RE, (_m, pre: string, d: string) => `${pre}\`due:${d}\``)
    .replace(
      REPEAT_TOKEN_RE,
      (_m, pre: string, r: string) => `${pre}\`every:${r.toLowerCase()}\``,
    )
    .replace(MENTION_TOKEN_RE, (_m, pre: string, n: string) => `${pre}\`@${n}\``);
}

/** Applies decorateTaskText to every task line of a markdown string. */
export function decorateTaskLines(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const m = TASK_RE.exec(line);
      if (!m) return line;
      const head = line.slice(0, line.length - m[2].length);
      return head + decorateTaskText(m[2]);
    })
    .join("\n");
}
