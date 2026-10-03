/**
 * Remembers on this device whether an agent has changed a page yet — the
 * getting-started checklist on Home ticks "watch it edit a page" off
 * with it. Nothing leaves the device.
 */

const AGENT_CHANGED_KEY = "cotenk-agent-changed";

let agentRunning = false;
let turnSeq = 0;

/** Agent turn boundaries — lets file changes be attributed to agents.
 *  The end is delayed: file events trail the turn by the watcher
 *  debounce. */
export function setAgentRunning(running: boolean) {
  const turn = ++turnSeq;
  if (running) {
    agentRunning = true;
    return;
  }
  setTimeout(() => {
    if (turn === turnSeq) agentRunning = false;
  }, 1500);
}

/** An agent has changed a page on this device at least once. */
export function hasAgentChangedPage(): boolean {
  try {
    return localStorage.getItem(AGENT_CHANGED_KEY) === "1";
  } catch {
    return false;
  }
}

/** A page changed on disk; counts as an agent change while one runs. */
export function noteDiskChange() {
  if (!agentRunning) return;
  try {
    localStorage.setItem(AGENT_CHANGED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}
