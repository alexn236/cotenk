import type { Doc, Folder } from "./types";
import { AGENT_KINDS, AGENTS } from "./agents";
import { addDays, extractTasks, isoDay, nextFriday } from "./tasks";
import { docRelativePath, folderRelativePath } from "./file-sync";

/**
 * Inline autocomplete for text fields: what the user is typing at the
 * caret (a trigger) and what to offer for it.
 *
 *  - `[[…`     pages (and folders in the agent composer) → `[[Title]]`
 *  - `@…`      agent composer: pages + folders; pages/tasks: people and
 *              agents → `@name`
 *  - `due:…`   dates → `due:YYYY-MM-DD`
 */

export type SuggestMode = "agent" | "page";

export type TriggerKind = "link" | "mention" | "due";

export type Trigger = {
  kind: TriggerKind;
  /** Offset where the trigger text starts (replaced on pick). */
  start: number;
  /** Caret offset — the end of the replaced range. */
  end: number;
  query: string;
};

export type SuggestItem = {
  id: string;
  kind: "page" | "folder" | "agent" | "person" | "date";
  label: string;
  hint?: string;
  /** Text that replaces the trigger. */
  insert: string;
};

/** The trigger right before the caret, if any. */
export function findTrigger(
  text: string,
  caret: number,
  mode: SuggestMode,
): Trigger | null {
  const head = text.slice(0, caret);
  // [[ — up to the caret, no closing brackets or newline in between.
  const link = /\[\[([^[\]\n]{0,60})$/.exec(head);
  if (link) {
    return { kind: "link", start: link.index, end: caret, query: link[1] };
  }
  const due = /(^|\s)due:([\d-]{0,10})$/.exec(head);
  if (due && mode === "page") {
    const start = due.index + due[1].length;
    return { kind: "due", start, end: caret, query: due[2] };
  }
  // In the agent composer "@" references pages/folders, so titles with
  // spaces are allowed; elsewhere it's a single-word handle.
  const mention =
    mode === "agent"
      ? /(^|\s)@([^\s@][^@\n]{0,40}|)$/u.exec(head)
      : /(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u.exec(head);
  if (mention) {
    const start = mention.index + mention[1].length;
    return { kind: "mention", start, end: caret, query: mention[2] };
  }
  return null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Prefix matches first, then word-start, then substring. */
function rank(label: string, q: string): number {
  const l = norm(label);
  if (!q) return 1;
  if (l.startsWith(q)) return 0;
  if (l.split(/[\s/_-]+/).some((w) => w.startsWith(q))) return 1;
  if (l.includes(q)) return 2;
  return -1;
}

function pick<T>(items: T[], label: (t: T) => string, q: string, limit: number): T[] {
  return items
    .map((t) => ({ t, r: rank(label(t), q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map((x) => x.t);
}

function pageItems(docs: Doc[], folders: Folder[], q: string, limit: number): SuggestItem[] {
  const recent = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  return pick(recent, (d) => d.title || "Untitled", q, limit).map((d) => {
    const title = d.title.trim() || "Untitled";
    return {
      id: `page:${d.id}`,
      kind: "page",
      label: title,
      hint: docRelativePath(d, folders),
      insert: `[[${title}]]`,
    };
  });
}

function folderItems(docs: Doc[], folders: Folder[], q: string, limit: number): SuggestItem[] {
  return pick(folders, (f) => f.name, q, limit).map((f) => {
    const n = docs.filter((d) => d.folderId === f.id).length;
    return {
      id: `folder:${f.id}`,
      kind: "folder",
      label: f.name,
      hint: `${folderRelativePath(f)} · ${n} ${n === 1 ? "page" : "pages"}`,
      insert: `[[${f.name}/]]`,
    };
  });
}

function peopleItems(docs: Doc[], q: string): SuggestItem[] {
  const agents: SuggestItem[] = AGENT_KINDS.map((k) => ({
    id: `agent:${k}`,
    kind: "agent",
    label: AGENTS[k].handle,
    hint: AGENTS[k].name,
    insert: `@${AGENTS[k].handle} `,
  }));
  // People already used as owners, most frequent first; "you" always.
  const counts = new Map<string, { name: string; n: number }>();
  const agentHandles = new Set(agents.map((a) => a.label));
  for (const t of extractTasks(docs)) {
    for (const a of t.assignees) {
      const key = a.toLowerCase();
      if (agentHandles.has(key)) continue;
      const e = counts.get(key) ?? { name: a, n: 0 };
      e.n++;
      counts.set(key, e);
    }
  }
  if (!counts.has("you")) counts.set("you", { name: "you", n: 0 });
  const people: SuggestItem[] = [...counts.values()]
    // The mention being typed right now already counts as one use.
    .filter((p) => !(p.n === 1 && p.name.toLowerCase() === q))
    .sort((a, b) => b.n - a.n)
    .map((p) => ({
      id: `person:${p.name.toLowerCase()}`,
      kind: "person",
      label: p.name,
      hint: p.n > 0 ? `${p.n} ${p.n === 1 ? "task" : "tasks"}` : "person",
      insert: `@${p.name} `,
    }));
  return pick([...agents, ...people], (i) => i.label, q, 8);
}

function dateItems(q: string): SuggestItem[] {
  const today = isoDay(new Date());
  const d = new Date(`${today}T00:00:00`);
  // Monday of next week — never the same day as "Tomorrow".
  const days = (8 - d.getDay()) % 7 || 7;
  const toMonday = days === 1 ? 8 : days;
  const opts: [string, string][] = [
    ["Today", today],
    ["Tomorrow", addDays(today, 1)],
    ["Friday", nextFriday(today)],
    ["Next Monday", addDays(today, toMonday)],
    ["In 2 weeks", addDays(today, 14)],
    ["In a month", addDays(today, 30)],
  ];
  return opts
    .filter(([, iso]) => !q || iso.startsWith(q))
    .map(([label, iso]) => ({
      id: `date:${label}`,
      kind: "date",
      label,
      hint: iso,
      insert: `due:${iso} `,
    }));
}

export function suggestionsFor(
  trigger: Trigger,
  mode: SuggestMode,
  docs: Doc[],
  folders: Folder[],
): SuggestItem[] {
  const q = norm(trigger.query);
  if (trigger.kind === "due") return dateItems(trigger.query.trim());
  if (trigger.kind === "mention" && mode === "page") return peopleItems(docs, q);
  // [[ everywhere, @ in the agent composer: pages (+ folders for agents).
  if (mode === "agent") {
    const folders_ = folderItems(docs, folders, q, 4);
    return [...pageItems(docs, folders, q, 8 - Math.min(folders_.length, 3)), ...folders_].slice(0, 9);
  }
  return pageItems(docs, folders, q, 8);
}

/** Applies a picked item: returns the new text and caret position. */
export function applySuggestion(
  text: string,
  trigger: Trigger,
  item: SuggestItem,
): { text: string; caret: number } {
  let after = text.slice(trigger.end);
  // Typing "[[" may already have produced closing brackets.
  if (item.insert.endsWith("]]") && after.startsWith("]]")) after = after.slice(2);
  // A space after the inserted token, unless one follows already.
  const insert =
    item.insert.endsWith(" ") || /^\s/.test(after) ? item.insert : `${item.insert} `;
  const next = text.slice(0, trigger.start) + insert + after;
  return { text: next, caret: trigger.start + insert.length };
}

/**
 * Agent context for the pages and folders a message references with
 * [[Title]] / [[Folder/]] — the agent gets the real file paths.
 */
export function referenceContext(text: string, docs: Doc[], folders: Folder[]): string | null {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[\[([^[\]|\n]+?)(?:\|[^\]\n]*)?\]\]/g)) {
    const raw = m[1].trim();
    if (seen.has(raw.toLowerCase())) continue;
    seen.add(raw.toLowerCase());
    if (raw.endsWith("/")) {
      const name = raw.slice(0, -1).trim().toLowerCase();
      const f = folders.find((x) => x.name.trim().toLowerCase() === name);
      if (f) {
        const n = docs.filter((d) => d.folderId === f.id).length;
        lines.push(`- folder "${f.name}" → directory ${folderRelativePath(f)} (${n} pages)`);
      }
      continue;
    }
    const d = docs.find((x) => (x.title.trim() || "Untitled").toLowerCase() === raw.toLowerCase());
    if (d) {
      lines.push(`- page "${raw}" → file ${docRelativePath(d, folders)} (cotenk-id ${d.id})`);
    }
  }
  return lines.length
    ? `The user referenced these workspace items ([[…]] in the message):\n${lines.join("\n")}\nIf a path doesn't exist, search the workspace for the cotenk-id.`
    : null;
}
