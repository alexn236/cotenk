import { create } from "zustand";
import type { AgentKind } from "./agents";
import { track } from "./analytics";

/**
 * Review of agent actions. ACP agents ask before they edit a file or run
 * a command (`session/request_permission`); instead of auto-approving,
 * CoTenk shows the change as a block diff and lets the person decide.
 * Reading and searching inside the workspace folder need no approval.
 * Anything that reaches outside it — reading, changing, a command with an
 * outside path — always waits for the person, one step at a time, also
 * with auto-approve on.
 */

export type ApprovalMode = "review" | "auto";

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
};

export type FileDiff = {
  path: string;
  /** null when the agent creates the file. */
  oldText: string | null;
  newText: string;
};

export type PermissionRequest = {
  id: number;
  agent: AgentKind;
  sessionId: string;
  title: string;
  /** ACP tool kind: edit, delete, move, execute, other, … */
  kind: string | null;
  diffs: FileDiff[];
  /** Shell command for execute requests, when the agent sends it. */
  command: string | null;
  options: PermissionOption[];
  /** Every file path the step names (diffs, locations, tool input). */
  paths: string[];
  /** The workspace folder the agent was started in. */
  cwd: string | null;
  /** Why this step needs a closer look (shown in the review dialog). */
  note?: string;
  /** Set when the step reaches outside the workspace folder. */
  outside?: string | null;
};

/** Tool kinds that only look at things — never worth a prompt. */
const SAFE_KINDS = new Set(["read", "search", "think", "fetch", "switch_mode"]);

const MODE_KEY = "cotenk-agent-approval";
const CONFIRM_KEY = "cotenk-agent-confirm-commands";

function readMode(): ApprovalMode {
  try {
    return localStorage.getItem(MODE_KEY) === "auto" ? "auto" : "review";
  } catch {
    return "review";
  }
}

function readConfirmCommands(): boolean {
  try {
    return localStorage.getItem(CONFIRM_KEY) !== "off";
  } catch {
    return true;
  }
}

type PermissionState = {
  mode: ApprovalMode;
  /** Commands still ask first when auto-approve is on. */
  confirmCommands: boolean;
  queue: PermissionRequest[];
  setMode: (m: ApprovalMode) => void;
  setConfirmCommands: (on: boolean) => void;
};

export const usePermissions = create<PermissionState>((set) => ({
  mode: readMode(),
  confirmCommands: readConfirmCommands(),
  queue: [],
  setMode: (mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
    set({ mode });
  },
  setConfirmCommands: (confirmCommands) => {
    try {
      localStorage.setItem(CONFIRM_KEY, confirmCommands ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
    set({ confirmCommands });
  },
}));

/* ---------- keeping changes inside the workspace folder ---------- */

const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/** Normalized absolute form (forward slashes, no . or .., lowercase); null = unknown. */
function resolvePath(p: string, root: string | null): string | null {
  let s = p.trim().replace(/\\/g, "/").replace(/^\/\/\?\//, "");
  if (!s || /^[~$]/.test(s) || /%[A-Za-z_]+%/.test(s)) return null;
  s = s.replace(/\/{2,}/g, "/");
  const absolute = /^([A-Za-z]:)?\//.test(s) || /^[A-Za-z]:$/.test(s);
  if (!absolute) {
    const base = root ? resolvePath(root, null) : null;
    if (!base) return null;
    s = `${base}/${s}`;
  }
  const lead = s.startsWith("/") ? "/" : "";
  const out: string[] = [];
  for (const part of s.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return (lead + out.join("/")).toLowerCase();
}

function isInside(path: string, root: string): boolean {
  const r = resolvePath(root, null);
  const p = resolvePath(path, root);
  return !!r && !!p && (p === r || p.startsWith(`${r}/`));
}

const WIN_PATH = /(?:[A-Za-z]:[\\/]|\\\\[^\\/\s"']+[\\/])[^\s"'|&<>^]*/g;
const POSIX_PATH = /(?:^|[\s"'=])(\/[^\s"'|&<>;]*\/[^\s"'|&<>;]*)/g;
const QUOTED = /"([^"\n]+)"|'([^'\n]+)'/g;

/**
 * What a shell command visibly reaches for: an absolute path outside the
 * workspace (`outside`), or something that can't be judged from the text —
 * `..`, `~`, home variables, a path cut off at a space (`unsure`).
 */
function inspectCommand(
  command: string,
  root: string,
): { outside: string | null; unsure: boolean } {
  const candidates = new Set<string>();
  for (const m of command.matchAll(QUOTED)) {
    const q = m[1] ?? m[2] ?? "";
    if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(q)) candidates.add(q);
  }
  for (const m of command.matchAll(WIN_PATH)) candidates.add(m[0]);
  if (!isWindows) {
    for (const m of command.matchAll(POSIX_PATH)) candidates.add(m[1]);
  }
  const rootKey = resolvePath(root, null) ?? "";
  let outside: string | null = null;
  let unsure = false;
  for (const c of candidates) {
    if (isInside(c, root)) continue;
    const key = resolvePath(c, null);
    // `C:\Users\me\My` of `C:\Users\me\My Docs\CoTenk` — cut off at a space.
    if (key && rootKey.startsWith(key)) unsure = true;
    else outside ??= c;
  }
  if (
    /(?:^|[\s"'\\/=])\.\.(?:[\\/]|$|["'\s])/.test(command) ||
    /(?:^|[\s"'=])~(?:[\\/]|$|\s)/.test(command) ||
    /%(?:USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|HOMEDRIVE|TEMP|TMP|SYSTEMROOT|PROGRAMFILES)%|\$(?:\{)?(?:HOME|USERPROFILE|TMPDIR)\b|\$env:/i.test(
      command,
    )
  ) {
    unsure = true;
  }
  return { outside, unsure };
}

let seq = 0;
const resolvers = new Map<number, (optionId: string | null) => void>();
/** `${agent}:${sessionId}:${kind}` the person allowed for the whole chat. */
const allowedForChat = new Set<string>();

const pick = (options: PermissionOption[], kinds: string[]) =>
  kinds
    .map((k) => options.find((o) => o.kind === k))
    .find((o) => o !== undefined) ?? null;

/**
 * Decides a permission request: answers immediately when no review is
 * needed, otherwise queues it for the dialog. Resolves to the chosen
 * optionId, or null when the turn was cancelled.
 */
export function requestPermission(
  req: Omit<PermissionRequest, "id">,
): Promise<string | null> {
  const { mode, confirmCommands } = usePermissions.getState();
  const chatKey = `${req.agent}:${req.sessionId}:${req.kind ?? "other"}`;
  const isCommand = req.kind === "execute" || req.command !== null;
  const safe = req.kind !== null && SAFE_KINDS.has(req.kind) && !isCommand;
  let note = req.note;
  let forceReview = false;

  // Outside the workspace folder nothing happens without the person —
  // whatever the approval mode, and never "for the whole chat".
  let outside: string | null = null;
  if (req.cwd) {
    outside =
      req.paths.find((p) => p.trim() !== "" && !isInside(p, req.cwd!)) ?? null;
    const cmd = isCommand && req.command ? inspectCommand(req.command, req.cwd) : null;
    outside ??= cmd?.outside ?? null;
    if (outside) {
      forceReview = true;
      note = `This reaches outside your workspace folder: ${outside}`;
    } else if (cmd?.unsure) {
      forceReview = true;
      note =
        "This command uses a relative or home-folder path, so CoTenk can't tell whether it stays inside your workspace folder.";
    }
  }

  const autoAllow =
    !forceReview &&
    (safe ||
      (allowedForChat.has(chatKey) ||
        (mode === "auto" && !(isCommand && confirmCommands))));
  if (autoAllow) {
    const opt = pick(req.options, ["allow_once", "allow_always"]) ?? req.options[0];
    return Promise.resolve(opt?.optionId ?? null);
  }
  const id = ++seq;
  usePermissions.setState((s) => ({
    queue: [...s.queue, { ...req, note, outside, id }],
  }));
  return new Promise((resolve) => resolvers.set(id, resolve));
}

function settle(id: number, optionId: string | null) {
  const resolve = resolvers.get(id);
  resolvers.delete(id);
  usePermissions.setState((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
  resolve?.(optionId);
}

/** The person's decision from the review dialog. */
export function answerPermission(
  id: number,
  decision: "allow" | "allow_chat" | "reject",
) {
  const req = usePermissions.getState().queue.find((r) => r.id === id);
  if (!req) return;
  track("agent_permission", { decision, kind: req.kind, agent: req.agent });
  if (decision === "reject") {
    const opt = pick(req.options, ["reject_once", "reject_always"]);
    settle(id, opt?.optionId ?? null);
    return;
  }
  // Outside the folder every step is its own decision.
  if (req.outside && decision === "allow_chat") decision = "allow";
  if (decision === "allow_chat") {
    allowedForChat.add(`${req.agent}:${req.sessionId}:${req.kind ?? "other"}`);
  }
  const opt =
    decision === "allow_chat"
      ? pick(req.options, ["allow_always", "allow_once"])
      : pick(req.options, ["allow_once", "allow_always"]);
  settle(id, opt?.optionId ?? req.options[0]?.optionId ?? null);
}

/** Drops pending requests of an agent (turn cancelled, process gone). */
export function cancelPermissions(agent: AgentKind) {
  for (const r of usePermissions.getState().queue) {
    if (r.agent === agent) settle(r.id, null);
  }
}

/* ---------- block diff ---------- */

export type BlockChange =
  | { type: "same"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string };

/** Frontmatter is bookkeeping, not content — keep it out of reviews. */
function body(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .trim();
}

/** Page blocks are separated by blank lines. */
export const splitBlocks = (text: string): string[] =>
  body(text)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

/** LCS diff over blocks — pages have tens of blocks, so O(n·m) is fine. */
export function diffBlocks(oldText: string | null, newText: string): BlockChange[] {
  const a = oldText === null ? [] : splitBlocks(oldText);
  const b = splitBlocks(newText);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: BlockChange[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "removed", text: a[i++] });
    } else {
      out.push({ type: "added", text: b[j++] });
    }
  }
  while (i < n) out.push({ type: "removed", text: a[i++] });
  while (j < m) out.push({ type: "added", text: b[j++] });
  return out;
}

/**
 * Number of blocks a change touches — a removed+added pair next to each
 * other counts as one edited block.
 */
export function changedBlockCount(changes: BlockChange[]): number {
  let count = 0;
  for (let k = 0; k < changes.length; k++) {
    const c = changes[k];
    if (c.type === "same") continue;
    count++;
    if (c.type === "removed" && changes[k + 1]?.type === "added") k++;
  }
  return count;
}
