/**
 * Model-option grouping for the Devin ACP model picker.
 * ACP exposes every (family × effort × variant) combination as a flat
 * `model` config option — e.g. `gpt-6-luna-high-priority` or
 * `claude-opus-5-5-medium-fast`. This module folds them back into
 * families with selectable effort / fast-mode / 1M-context settings,
 * mirroring the Devin Desktop model menu.
 */

export type ModelOption = {
  value: string;
  name: string;
  supportsImages?: boolean;
};

export type Effort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export const EFFORT_ORDER: Effort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export const EFFORT_LABEL: Record<Effort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

export type ParsedValue = {
  /** Family id, e.g. "gpt-6-luna". */
  family: string;
  effort: Effort | null;
  /** `-fast` (Claude) or `-priority` (GPT) throughput variant. */
  fast: boolean;
  /** `-1m` extended-context variant. */
  ctx1m: boolean;
  /** `-thinking` suffix (rare; mostly baked into names). */
  thinking: boolean;
};

const EFFORT_SET = new Set<string>(EFFORT_ORDER);

export function parseModelValue(value: string): ParsedValue {
  let s = value;
  let ctx1m = false;
  let fast = false;
  let thinking = false;
  // Trailing modifiers come after the effort token — strip them first.
  for (;;) {
    if (s.endsWith("-1m")) {
      ctx1m = true;
      s = s.slice(0, -3);
    } else if (s.endsWith("-fast") || s.endsWith("-priority")) {
      fast = true;
      s = s.replace(/-(fast|priority)$/, "");
    } else if (s.endsWith("-thinking")) {
      thinking = true;
      s = s.slice(0, -9);
    } else break;
  }
  const last = s.split("-").pop() ?? "";
  let effort: Effort | null = null;
  if (EFFORT_SET.has(last)) {
    effort = last as Effort;
    s = s.slice(0, -(last.length + 1));
  }
  return { family: s, effort, fast, ctx1m, thinking };
}

/** "Claude Opus 5.5 Medium Fast" → "Claude Opus 5.5" */
function familyLabel(name: string): string {
  return (
    name
      .replace(
        /(\s+(None|Minimal|Low|Medium|High|XHigh|Max|Fast|Priority|Thinking|1M))+$/i,
        "",
      )
      .trim() || name
  );
}

export type ModelVariant = {
  value: string;
  name: string;
  effort: Effort | null;
  fast: boolean;
  ctx1m: boolean;
};

export type ModelFamily = {
  id: string;
  label: string;
  variants: ModelVariant[];
  /** Efforts this family actually offers, ordered. */
  efforts: Effort[];
  hasFast: boolean;
  hasCtx1m: boolean;
  supportsImages: boolean;
};

export function groupModels(models: ModelOption[]): ModelFamily[] {
  const fams = new Map<string, ModelFamily>();
  for (const m of models) {
    if (m.value.startsWith("MODEL_")) continue; // legacy enum ids
    const p = parseModelValue(m.value);
    let f = fams.get(p.family);
    if (!f) {
      f = {
        id: p.family,
        label: familyLabel(m.name),
        variants: [],
        efforts: [],
        hasFast: false,
        hasCtx1m: false,
        supportsImages: false,
      };
      fams.set(p.family, f);
    }
    f.variants.push({
      value: m.value,
      name: m.name,
      effort: p.effort,
      fast: p.fast,
      ctx1m: p.ctx1m,
    });
    if (p.effort && !f.efforts.includes(p.effort)) f.efforts.push(p.effort);
    if (p.fast) f.hasFast = true;
    if (p.ctx1m) f.hasCtx1m = true;
    if (m.supportsImages) f.supportsImages = true;
  }
  for (const f of fams.values()) {
    f.efforts.sort(
      (a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b),
    );
  }
  // Preserve the ACP ordering (recommended models first).
  return [...fams.values()];
}

/**
 * Resolve a desired (effort, fast, ctx1m) combination to a real option.
 * Falls back gracefully when the exact combo doesn't exist.
 */
export function resolveVariant(
  fam: ModelFamily,
  effort: Effort | null,
  fast: boolean,
  ctx1m: boolean,
): ModelVariant {
  const score = (v: ModelVariant) =>
    (v.effort === effort ? 4 : 0) +
    (v.fast === fast ? 2 : 0) +
    (v.ctx1m === ctx1m ? 1 : 0);
  return fam.variants.reduce((best, v) =>
    score(v) > score(best) ? v : best,
  );
}

/** Rough relative-cost position for the gradient bar (0..1). */
export function effortCost(effort: Effort | null): number {
  if (!effort) return 0.5;
  const i = EFFORT_ORDER.indexOf(effort);
  return i < 0 ? 0.5 : i / (EFFORT_ORDER.length - 1);
}
