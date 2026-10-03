/**
 * Theme preference: dark, light, or "system" (follows the OS and
 * switches live). public/theme-init.js applies the same rules before
 * first paint, so keep the two in sync.
 */

export type Theme = "dark" | "light";
export type ThemePref = Theme | "system";

const KEY = "cotenk-theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  // Nothing chosen yet — same as the pre-paint script: follow the OS.
  return "system";
}

export function storeThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable */
  }
}

const systemTheme = (): Theme =>
  typeof window !== "undefined" && window.matchMedia?.(LIGHT_QUERY).matches
    ? "light"
    : "dark";

export const resolveTheme = (pref: ThemePref): Theme =>
  pref === "system" ? systemTheme() : pref;

export function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}

/** Calls `onChange` when the OS switches between light and dark. */
export function onSystemThemeChange(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(LIGHT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
