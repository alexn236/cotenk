import { useWorkspace } from "./store";
import { useProfile } from "./profile";
import { extractTasks, isoDay, type TaskItem } from "./tasks";
import { toast } from "./toast";

/**
 * Reminders and mentions for the person using this device:
 *  - a task that newly appears with your @name (an agent or the file
 *    mirror wrote it) — not what you type yourself;
 *  - a daily summary of your tasks that are due today or overdue.
 * Shown as a toast, or a system notification while the app is in the
 * background.
 */

const KEY = "cotenk-notify";
const DIGEST_KEY = "cotenk-notify-digest";

export const notificationsEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

export function setNotificationsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission().catch(() => {});
  }
}

/** Lowercase @names that mean "me". */
function myHandles(): Set<string> {
  const out = new Set(["me", "you"]);
  const name = useProfile.getState().name.trim().toLowerCase();
  if (name) {
    out.add(name);
    out.add(name.replace(/\s+/g, "-"));
    out.add(name.replace(/\s+/g, ""));
    out.add(name.split(/\s+/)[0]);
  }
  return out;
}

const mine = (t: TaskItem, handles: Set<string>) =>
  !t.done && t.assignees.some((a) => handles.has(a.toLowerCase()));

const keyOf = (t: TaskItem) => `${t.docId}|${t.raw}`;

function notify(title: string, body: string) {
  if (document.hasFocus()) {
    toast(`${title} — ${body}`);
    return;
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
      return;
    }
  } catch {
    /* fall through to the toast */
  }
  toast(`${title} — ${body}`);
}

export function startNotifications(): () => void {
  let known = new Set<string>();
  let primed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const myTasks = () => {
    const handles = myHandles();
    return extractTasks(useWorkspace.getState().docs).filter((t) => mine(t, handles));
  };

  const digest = () => {
    const today = isoDay(new Date());
    try {
      const last = localStorage.getItem(DIGEST_KEY);
      if (last === today) return;
      localStorage.setItem(DIGEST_KEY, today);
      // The very first start shows the sample workspace — its tasks are
      // examples, not a to-do list worth a reminder.
      if (last === null) return;
    } catch {
      /* storage unavailable — summarize once per start */
    }
    const tasks = myTasks();
    const overdue = tasks.filter((t) => t.due && t.due < today).length;
    const dueToday = tasks.filter((t) => t.due === today).length;
    if (overdue + dueToday === 0) return;
    const parts = [
      dueToday > 0 ? `${dueToday} due today` : "",
      overdue > 0 ? `${overdue} overdue` : "",
    ].filter(Boolean);
    notify("Your tasks", parts.join(" · "));
  };

  const prime = () => {
    known = new Set(myTasks().map(keyOf));
    primed = true;
    if (notificationsEnabled()) digest();
  };

  const tryPrime = () => {
    if (!primed) prime();
  };
  const schedulePrime = () => {
    primed = false;
    known = new Set();
    if (timer) clearTimeout(timer);
    timer = setTimeout(tryPrime, 2500);
  };
  schedulePrime();

  const check = () => {
    if (!primed || !notificationsEnabled()) return;
    const st = useWorkspace.getState();
    const typingHere = (docId: string) =>
      st.activeDocId === docId && st.railSection === "docs" && document.hasFocus();
    const tasks = myTasks();
    const fresh = tasks.filter((t) => !known.has(keyOf(t)) && !typingHere(t.docId));
    known = new Set(tasks.map(keyOf));
    if (fresh.length === 1) {
      notify("New task for you", `${fresh[0].text} · ${fresh[0].docTitle.trim() || "Untitled"}`);
    } else if (fresh.length > 1) {
      notify("New tasks for you", `${fresh.length} tasks were assigned to you`);
    }
  };

  const unsubDocs = useWorkspace.subscribe((s, prev) => {
    if (s.docs === prev.docs) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(check, 1200);
  });
  const unsubName = useProfile.subscribe((s, prev) => {
    if (s.name !== prev.name) schedulePrime();
  });

  return () => {
    unsubDocs();
    unsubName();
    if (timer) clearTimeout(timer);
    if (debounce) clearTimeout(debounce);
  };
}
