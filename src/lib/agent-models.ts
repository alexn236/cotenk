/**
 * Model-option grouping for the Devin ACP model picker.
 * ACP exposes every (family × effort × variant) combination as a flat
 * `model` config option — e.g. `gpt-6-luna-high-priority` or
 * `claude-opus-5-5-medium-fast`. This module folds them back into
 * families with selectable effort / fast-mode / 1M-context settings,
 * mirroring the Devin Desktop model menu.
 */

import {
  blendedCost,
  costPosition,
  priceFor,
  type ModelPrice,
} from "./agent-pricing";

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

/**
 * Fusion pairs a lead model with a cheaper sidekick. ACP lists every
 * combination flat (335 of them), e.g.
 *   fusion-gpt-6-astra-high-fast-sidekick-glm-5-2
 *   → lead gpt-6-astra · effort high · fast · sidekick glm-5-2
 * The picker folds them into one "Fusion" entry with four knobs.
 */
export const FUSION_ID = "fusion";

export type FusionParts = {
  lead: string;
  effort: Effort | null;
  fast: boolean;
  /** Sidekick model value, e.g. "swe-2-medium". */
  sidekick: string;
};

const FUSION_RE =
  /^fusion-(.+?)-(none|minimal|low|medium|high|xhigh|max)(-fast)?-sidekick-(.+)$/;

export function parseFusion(value: string): FusionParts | null {
  const m = value.match(FUSION_RE);
  if (!m) return null;
  return {
    lead: m[1],
    effort: m[2] as Effort,
    fast: !!m[3],
    sidekick: m[4],
  };
}

export type FusionVariant = FusionParts & { value: string };

export type FusionInfo = {
  leads: { id: string; label: string }[];
  sidekicks: { id: string; label: string }[];
  variants: FusionVariant[];
};

/** Closest existing combination — not every lead × sidekick exists. */
export function resolveFusion(
  info: FusionInfo,
  want: FusionParts,
): FusionVariant {
  const score = (v: FusionVariant) =>
    (v.lead === want.lead ? 8 : 0) +
    (v.sidekick === want.sidekick ? 4 : 0) +
    (v.effort === want.effort ? 2 : 0) +
    (v.fast === want.fast ? 1 : 0);
  return info.variants.reduce((best, v) =>
    score(v) > score(best) ? v : best,
  );
}

export function parseModelValue(value: string): ParsedValue {
  const fusion = parseFusion(value);
  if (fusion) {
    return {
      family: FUSION_ID,
      effort: fusion.effort,
      fast: fusion.fast,
      ctx1m: false,
      thinking: false,
    };
  }
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
  /** Set on the single folded Fusion family. */
  fusion?: FusionInfo;
};

export function groupModels(models: ModelOption[]): ModelFamily[] {
  const fams = new Map<string, ModelFamily>();
  for (const m of models) {
    if (m.value.startsWith("MODEL_")) continue; // legacy enum ids
    const fp = parseFusion(m.value);
    if (fp) {
      addFusion(fams, m, fp);
      continue;
    }
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
  // Preserve the ACP ordering (recommended models first) — except Fusion,
  // whose variants arrive mid-list but which is one headline entry.
  const list = [...fams.values()];
  const fusion = list.findIndex((f) => f.id === FUSION_ID);
  if (fusion > 0) list.unshift(...list.splice(fusion, 1));
  return list;
}

/** "Fusion (GPT-6 Astra High Thinking Fast + GLM-5.2 High)" → parts. */
const FUSION_NAME_RE = /^Fusion \((.+) \+ (.+)\)$/;

function addFusion(
  fams: Map<string, ModelFamily>,
  m: ModelOption,
  p: FusionParts,
) {
  let f = fams.get(FUSION_ID);
  if (!f) {
    f = {
      id: FUSION_ID,
      label: "Fusion",
      variants: [],
      efforts: [],
      hasFast: false,
      hasCtx1m: false,
      supportsImages: false,
      fusion: { leads: [], sidekicks: [], variants: [] },
    };
    fams.set(FUSION_ID, f);
  }
  const info = f.fusion!;
  const names = m.name.match(FUSION_NAME_RE);
  if (!info.leads.some((l) => l.id === p.lead)) {
    info.leads.push({
      id: p.lead,
      label: names ? familyLabel(names[1]) : p.lead,
    });
  }
  if (!info.sidekicks.some((s) => s.id === p.sidekick)) {
    info.sidekicks.push({
      id: p.sidekick,
      label: names?.[2] ?? p.sidekick,
    });
  }
  info.variants.push({ ...p, value: m.value });
  f.variants.push({
    value: m.value,
    name: m.name,
    effort: p.effort,
    fast: p.fast,
    ctx1m: false,
  });
  if (p.effort && !f.efforts.includes(p.effort)) f.efforts.push(p.effort);
  if (p.fast) f.hasFast = true;
  if (m.supportsImages) f.supportsImages = true;
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

export type ModelCost = {
  /** The model itself, or the lead for Fusion. */
  main: ModelPrice | null;
  /** Fusion only. */
  sidekick: ModelPrice | null;
  /** Position on the cost bar (0..1), null when the price is unknown. */
  position: number | null;
};

/** Published pricing for an ACP model value (Devin models only). */
export function modelCost(value: string): ModelCost {
  const f = parseFusion(value);
  const main = f
    ? priceFor(`${f.lead}-${f.effort}${f.fast ? "-fast" : ""}`)
    : priceFor(value);
  const sidekick = f ? priceFor(f.sidekick) : null;
  // Fusion splits the work; the midpoint is a fair single-number summary.
  const parts = f ? [main, sidekick] : [main];
  const known = parts.filter((p): p is ModelPrice => p !== null);
  const position =
    known.length === parts.length
      ? costPosition(
          known.reduce((sum, p) => sum + blendedCost(p), 0) / known.length,
        )
      : null;
  return { main, sidekick, position };
}
