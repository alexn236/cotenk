/**
 * Product analytics for the activation funnel, sent to PostHog (EU).
 * Deliberately tiny: no SDK, no cookies, no autocapture, no page
 * content — only named events with counters and timings.
 *
 * Enabled when VITE_POSTHOG_KEY is set, the user hasn't opted out
 * (Settings → About) and the browser doesn't send Do-Not-Track.
 *
 * The two numbers this exists for:
 *  - activation: `agent_page_changed` with `first: true` and
 *    `session_index: 1` — an agent changed a page in the first session.
 *  - `signed_in` → `minutes_since_first_open` — how long people work
 *    locally before creating an account.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://eu.i.posthog.com";

const LS = {
  anonId: "cotenk-aid",
  firstOpen: "cotenk-first-open",
  sessions: "cotenk-sessions",
  lastSeen: "cotenk-last-seen",
  optOut: "cotenk-analytics-optout",
  agentChanged: "cotenk-agent-changed",
} as const;

/** A gap longer than this starts a new session. */
const SESSION_GAP_MS = 30 * 60_000;
const FLUSH_MS = 4000;

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function put(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

type Event = {
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

let queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let userId: string | null = null;
let sessionIndex = 1;
let agentRunning = false;
/** One agent_page_changed per turn is enough. */
let changeSeenThisTurn = false;

export function analyticsAvailable(): boolean {
  return !!KEY;
}

export function analyticsEnabled(): boolean {
  if (!KEY || typeof window === "undefined") return false;
  if (get(LS.optOut) === "1") return false;
  return navigator.doNotTrack !== "1";
}

export function setAnalyticsEnabled(on: boolean) {
  put(LS.optOut, on ? "0" : "1");
  if (!on) queue = [];
}

function anonId(): string {
  let id = get(LS.anonId);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    put(LS.anonId, id);
  }
  return id;
}

function firstOpen(): number {
  const v = Number(get(LS.firstOpen));
  if (v > 0) return v;
  const now = Date.now();
  put(LS.firstOpen, String(now));
  return now;
}

const minutesSinceFirstOpen = () =>
  Math.round((Date.now() - firstOpen()) / 60_000);

function flush() {
  timer = null;
  if (queue.length === 0 || !KEY) return;
  const batch = queue;
  queue = [];
  void fetch(`${HOST}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: KEY, batch }),
    keepalive: true,
  }).catch(() => {
    /* offline — these events are dropped, never retried forever */
  });
}

/** Records an event (no-op when analytics is off). */
export function track(event: string, props: Record<string, unknown> = {}) {
  if (!analyticsEnabled()) return;
  put(LS.lastSeen, String(Date.now()));
  queue.push({
    event,
    distinct_id: userId ?? anonId(),
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      session_index: sessionIndex,
      platform: "__TAURI_INTERNALS__" in window ? "desktop" : "web",
      $process_person_profile: userId !== null,
    },
  });
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

/** Once per app start: session bookkeeping + `app_opened`. */
export function initAnalytics() {
  if (typeof window === "undefined") return;
  const first = !get(LS.firstOpen);
  firstOpen();
  const last = Number(get(LS.lastSeen)) || 0;
  const count = Number(get(LS.sessions)) || 0;
  sessionIndex =
    count === 0 || Date.now() - last > SESSION_GAP_MS ? count + 1 : count;
  put(LS.sessions, String(sessionIndex));
  track("app_opened", { first_open: first });
  window.addEventListener("pagehide", flush);
}

/** Links the anonymous device history to the account. */
export function identify(id: string, method: "session" | "sign_in") {
  if (userId === id) return;
  const anon = anonId();
  userId = id;
  if (!analyticsEnabled()) return;
  queue.push({
    event: "$identify",
    distinct_id: id,
    timestamp: new Date().toISOString(),
    properties: { $anon_distinct_id: anon },
  });
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
  if (method === "sign_in") {
    track("signed_in", { minutes_since_first_open: minutesSinceFirstOpen() });
  }
}

export function resetIdentity() {
  userId = null;
}

let turnSeq = 0;

/** Agent turn boundaries — lets file changes be attributed to agents.
 *  The end is delayed: file events trail the turn by the watcher
 *  debounce. */
export function setAgentRunning(running: boolean) {
  const turn = ++turnSeq;
  if (running) {
    agentRunning = true;
    changeSeenThisTurn = false;
    return;
  }
  setTimeout(() => {
    if (turn === turnSeq) agentRunning = false;
  }, 1500);
}

/** An agent has changed a page on this device at least once. */
export function hasAgentChangedPage(): boolean {
  return get(LS.agentChanged) === "1";
}

/** A page changed on disk; counts as an agent change while one runs. */
export function noteDiskChange() {
  if (!agentRunning || changeSeenThisTurn) return;
  changeSeenThisTurn = true;
  const first = get(LS.agentChanged) !== "1";
  if (first) put(LS.agentChanged, "1");
  track("agent_page_changed", {
    first,
    minutes_since_first_open: minutesSinceFirstOpen(),
  });
}
