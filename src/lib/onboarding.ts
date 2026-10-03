/**
 * Getting-started state (per device). The checklist lives in one place —
 * Home — and the app opens there until it's done or dismissed.
 */

const DISMISSED_KEY = "cotenk-onboarding-dismissed";
const COMPLETE_KEY = "cotenk-onboarding-complete";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable */
  }
}

export const onboardingDismissed = () => read(DISMISSED_KEY);
export const dismissOnboarding = () => write(DISMISSED_KEY);
export const onboardingComplete = () => read(COMPLETE_KEY);
export const completeOnboarding = () => write(COMPLETE_KEY);

/** The first-run "pick your agents" dialog was finished or skipped. */
const AGENTS_KEY = "cotenk-onboarding-agents";
export const agentOnboardingDone = () => read(AGENTS_KEY);

/**
 * The first-run welcome flow (theme, agents) was finished.
 * People who already went through the older agent dialog or the Home
 * checklist count as done.
 */
const WELCOME_KEY = "cotenk-onboarding-welcome";
export const welcomeFinished = () =>
  read(WELCOME_KEY) ||
  agentOnboardingDone() ||
  onboardingComplete() ||
  onboardingDismissed();
export const finishWelcome = () => {
  write(WELCOME_KEY);
  write(AGENTS_KEY);
};

/** Open on Home (with the checklist) until onboarding is behind us. */
export const onboardingPending = () =>
  typeof window !== "undefined" &&
  !onboardingDismissed() &&
  !onboardingComplete();
