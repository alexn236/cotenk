import data from "./agent-pricing-data.json";

/**
 * USD-per-1M-token pricing per Devin model id, generated from the
 * official docs (docs.devin.ai/desktop/models → modelCostData).
 * Each entry is [input, cached input, output]. Two tiers exist; the
 * self-serve ("pro") tier currently has promos (SWE-2, GLM-5.2 free).
 * To refresh: re-extract modelCostData from that page.
 */
export type ModelPrice = {
  input: number;
  cached: number;
  output: number;
};

export type PricingTier = "pro" | "enterprise";

/** Tier shown in the picker. Self-serve is what most people are on. */
export const PRICING_TIER: PricingTier = "pro";

const TABLE = data as Record<PricingTier, Record<string, number[]>>;

/**
 * Price for an ACP model value. Fast variants are "-fast" for Claude
 * and "-priority" for GPT in the docs; both spellings are tried.
 */
export function priceFor(
  value: string,
  tier: PricingTier = PRICING_TIER,
): ModelPrice | null {
  const t = TABLE[tier];
  const row =
    t[value] ??
    t[value.replace(/-fast$/, "-priority")] ??
    t[value.replace(/-priority$/, "-fast")];
  return row ? { input: row[0], cached: row[1], output: row[2] } : null;
}

/** "$10" · "$0.26" · "Free" */
export function formatPrice(usd: number): string {
  if (usd === 0) return "Free";
  return `$${usd >= 1 ? +usd.toFixed(2) : +usd.toFixed(3)}`;
}

/** Blended cost used to place a model on the cost bar (3:1 in:out). */
export function blendedCost(p: ModelPrice): number {
  return (3 * p.input + p.output) / 4;
}

const bounds: Partial<Record<PricingTier, [number, number]>> = {};

function logBounds(tier: PricingTier): [number, number] {
  const costs = Object.values(TABLE[tier])
    .map(([i, , o]) => (3 * i + o) / 4)
    .filter((c) => c > 0);
  return [Math.log(Math.min(...costs)), Math.log(Math.max(...costs))];
}

/**
 * 0..1 position on a log scale between the cheapest and priciest paid
 * model of the tier — spreads $0.1 and $50 models across the bar.
 */
export function costPosition(cost: number, tier: PricingTier = PRICING_TIER): number {
  const [lo, hi] = (bounds[tier] ??= logBounds(tier));
  if (cost <= 0) return 0;
  return Math.min(1, Math.max(0, (Math.log(cost) - lo) / (hi - lo || 1)));
}
