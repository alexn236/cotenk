import type { Doc } from "./types";
import { seedDocs, WELCOME_ID } from "./mock-docs";
import { stripEmbedState } from "./embed-state";

/**
 * Welcome-page versioning. The welcome page is a normal doc, so once it
 * is in a workspace it stays frozen there. Each version gets its own id
 * (`d-welcome-v2`, …); a workspace that still holds an older version *in
 * its original form* gets it swapped for the current one. Edited copies
 * belong to the user and are left alone.
 *
 * To ship a new version: bump WELCOME_ID in mock-docs.ts, add the old id
 * to LEGACY_IDS and the fingerprint of the outgoing content to
 * LEGACY_FINGERPRINTS (run `welcomeFingerprint(content)` on it).
 */

export { WELCOME_ID };

/** Ids earlier versions used. */
const LEGACY_IDS = new Set(["d-welcome", "d-welcome-v2"]);

/** Fingerprints of the untouched content of every earlier version. */
const LEGACY_FINGERPRINTS = new Set([
  "5bc28c97", // v0 — first release
  "71d2ffb8", // v1 — pulse chart + burndown
  "d194afb1", // v2 — with account / sign-in copy
  "dcca9d37", // v2 — local-only copy
  "c2b7fafc", // v2 — [[Sync Architecture]] link
]);

/**
 * Stable fingerprint of a welcome page: date-agnostic (tasks carry
 * relative due dates) and tick-agnostic (ticking the "try it" tasks is
 * using the page, not customizing it — same for a widget's saved state).
 */
export function welcomeFingerprint(content: string): string {
  const norm = stripEmbedState(content)
    .replace(/\r\n?/g, "\n")
    .replace(/due:\d{4}-\d{2}-\d{2}/g, "due:")
    .replace(/^(\s*[-*+]\s+)\[[xX]\]/gm, "$1[ ]")
    .trim();
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Replaces an untouched older welcome page with the current version.
 * `onRemove` is told about every doc id that was dropped (sync deletes
 * them remotely). Returns `docs` unchanged when there is nothing to do —
 * including when the user deleted the welcome page on purpose.
 */
export function upgradeWelcome(
  docs: Doc[],
  onRemove?: (id: string) => void,
): Doc[] {
  if (docs.some((d) => d.id === WELCOME_ID)) return docs;
  const stale = docs.filter(
    (d) =>
      LEGACY_IDS.has(d.id) &&
      LEGACY_FINGERPRINTS.has(welcomeFingerprint(d.content)),
  );
  if (stale.length === 0) return docs;
  const seed = seedDocs.find((d) => d.id === WELCOME_ID);
  if (!seed) return docs;
  stale.forEach((d) => onRemove?.(d.id));
  const staleIds = new Set(stale.map((d) => d.id));
  return [
    { ...seed, updatedAt: Date.now() },
    ...docs.filter((d) => !staleIds.has(d.id)),
  ];
}
