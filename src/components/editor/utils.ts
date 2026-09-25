import { useEffect, useLayoutEffect } from "react";

/** useLayoutEffect on the client, useEffect during SSR (avoids the server warning). */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Grows a single-line-safe textarea to fit its content. */
export function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}
