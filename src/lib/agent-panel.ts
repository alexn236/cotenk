/** "Follow agent" for the page panel next to the agent chat (default on). */

const FOLLOW_KEY = "cotenk-agents-panel-follow";

export function followAgentEnabled(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setFollowAgent(on: boolean) {
  try {
    localStorage.setItem(FOLLOW_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}
