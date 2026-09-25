/**
 * USD-per-1M-token pricing, extracted from the official Devin docs
 * (docs.devin.ai/desktop/models — modelCostData, self-serve tier).
 * Keyed by normalized family label + "|f" fast variant + "|1m" ctx.
 * Devin bills at API list prices; SWE family is free on Pro (0s kept).
 */
export type ModelPrice = {
  input: number;
  output: number;
  cached: number;
  cacheWrite: number;
};

const TABLE: Record<string, ModelPrice> = {
  "adaptive": { input: 0.5, output: 2, cached: 0.1, cacheWrite: 0.5 },
  "arena|f": { input: 0.1, output: 0.5, cached: 0, cacheWrite: 0 },
  "claudefable5": { input: 10, output: 50, cached: 1, cacheWrite: 12.5 },
  "claudefable51": { input: 10, output: 50, cached: 0.25, cacheWrite: 12.5 },
  "claudehaiku45": { input: 1, output: 5, cached: 0.1, cacheWrite: 1.25 },
  "claudeopus45": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "claudeopus46": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "claudeopus46|1m": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "claudeopus47": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "claudeopus48": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "claudeopus48|f": { input: 10, output: 50, cached: 1, cacheWrite: 12.5 },
  "claudeopus5": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "claudeopus5|f": { input: 10, output: 50, cached: 1, cacheWrite: 12.5 },
  "claudesonnet45": { input: 3, output: 15, cached: 0.3, cacheWrite: 3.75 },
  "claudesonnet46": { input: 3, output: 15, cached: 0.3, cacheWrite: 3.75 },
  "claudesonnet46|1m": { input: 3, output: 15, cached: 0.3, cacheWrite: 3.75 },
  "claudesonnet5": { input: 2, output: 10, cached: 0.2, cacheWrite: 2.5 },
  "deepseekv4flash": { input: 0.14, output: 0.28, cached: 0.028, cacheWrite: 0 },
  "deepseekv4pro": { input: 1.32, output: 3.96, cached: 0.044, cacheWrite: 0 },
  "frontierarena": { input: 3, output: 15, cached: 0.3, cacheWrite: 3.75 },
  "gemini25pro": { input: 1.25, output: 10, cached: 0.125, cacheWrite: 4.5 },
  "gemini31pro": { input: 2, output: 12, cached: 0.2, cacheWrite: 4.5 },
  "gemini35flash": { input: 1.5, output: 9, cached: 0.15, cacheWrite: 1 },
  "gemini36flash": { input: 1.5, output: 7.5, cached: 0.15, cacheWrite: 1.5 },
  "gemini37flash": { input: 0.75, output: 3.75, cached: 0.075, cacheWrite: 0.75 },
  "gemini38flash": { input: 0.75, output: 3.75, cached: 0.075, cacheWrite: 0.75 },
  "gemini3flash": { input: 0.5, output: 3, cached: 0.05, cacheWrite: 1 },
  "glm52": { input: 0, output: 0, cached: 0, cacheWrite: 0 },
  "glm52no": { input: 0.7, output: 2.2, cached: 0.13, cacheWrite: 0 },
  "glm52no|1m": { input: 0.7, output: 2.2, cached: 0.13, cacheWrite: 0 },
  "glm52|1m": { input: 0.7, output: 2.2, cached: 0.13, cacheWrite: 0 },
  "glm53": { input: 1.4, output: 4.4, cached: 0.26, cacheWrite: 0 },
  "glm53flash": { input: 0.15, output: 0.5, cached: 0.029, cacheWrite: 0 },
  "gpt41": { input: 2, output: 8, cached: 0.5, cacheWrite: 0 },
  "gpt4o": { input: 2.5, output: 10, cached: 1.25, cacheWrite: 0 },
  "gpt5": { input: 1.25, output: 10, cached: 0.125, cacheWrite: 0 },
  "gpt51": { input: 1.25, output: 10, cached: 0.125, cacheWrite: 0 },
  "gpt51no": { input: 1.25, output: 10, cached: 0.125, cacheWrite: 0 },
  "gpt51no|f": { input: 2.5, output: 20, cached: 0.25, cacheWrite: 0 },
  "gpt51|f": { input: 2.5, output: 20, cached: 0.25, cacheWrite: 0 },
  "gpt52": { input: 1.75, output: 14, cached: 0.175, cacheWrite: 0 },
  "gpt52no": { input: 1.75, output: 14, cached: 0.175, cacheWrite: 0 },
  "gpt52no|f": { input: 3.5, output: 28, cached: 0.35, cacheWrite: 0 },
  "gpt52|f": { input: 3.5, output: 28, cached: 0.35, cacheWrite: 0 },
  "gpt53codex": { input: 1.75, output: 14, cached: 0.175, cacheWrite: 0 },
  "gpt53codexspark": { input: 1.75, output: 14, cached: 0.175, cacheWrite: 0 },
  "gpt53codexx": { input: 1.75, output: 14, cached: 0.175, cacheWrite: 0 },
  "gpt53codex|f": { input: 3.5, output: 28, cached: 0.35, cacheWrite: 0 },
  "gpt54": { input: 2.5, output: 15, cached: 0.25, cacheWrite: 0 },
  "gpt54mini": { input: 0.75, output: 4.5, cached: 0.075, cacheWrite: 0 },
  "gpt54no": { input: 2.5, output: 15, cached: 0.25, cacheWrite: 0 },
  "gpt54no|f": { input: 5, output: 30, cached: 0.5, cacheWrite: 0 },
  "gpt54|f": { input: 5, output: 30, cached: 0.5, cacheWrite: 0 },
  "gpt55": { input: 5, output: 30, cached: 0.5, cacheWrite: 0 },
  "gpt55no": { input: 5, output: 30, cached: 0.5, cacheWrite: 0 },
  "gpt55no|f": { input: 12.5, output: 75, cached: 1.25, cacheWrite: 0 },
  "gpt55review": { input: 5, output: 30, cached: 0.5, cacheWrite: 0 },
  "gpt55|f": { input: 12.5, output: 75, cached: 1.25, cacheWrite: 0 },
  "gpt56luna": { input: 0.2, output: 1.2, cached: 0.02, cacheWrite: 0.25 },
  "gpt56lunano": { input: 0.2, output: 1.2, cached: 0.02, cacheWrite: 0.25 },
  "gpt56lunano|f": { input: 0.4, output: 2.4, cached: 0.04, cacheWrite: 0.5 },
  "gpt56luna|f": { input: 0.4, output: 2.4, cached: 0.04, cacheWrite: 0.5 },
  "gpt56sol": { input: 1.2, output: 6, cached: 0.12, cacheWrite: 1.5 },
  "gpt56solno": { input: 1.2, output: 6, cached: 0.12, cacheWrite: 1.5 },
  "gpt56solno|f": { input: 8, output: 40, cached: 0.8, cacheWrite: 10 },
  "gpt56sol|f": { input: 8, output: 40, cached: 0.8, cacheWrite: 10 },
  "gpt56terra": { input: 2, output: 12, cached: 0.2, cacheWrite: 2.5 },
  "gpt56terrano": { input: 2, output: 12, cached: 0.2, cacheWrite: 2.5 },
  "gpt56terrano|f": { input: 4, output: 24, cached: 0.4, cacheWrite: 5 },
  "gpt56terra|f": { input: 4, output: 24, cached: 0.4, cacheWrite: 5 },
  "gpt6astra": { input: 10, output: 50, cached: 1, cacheWrite: 12.5 },
  "gptoss120b": { input: 0.15, output: 0.6, cached: 0.07, cacheWrite: 0 },
  "grok45": { input: 2, output: 6, cached: 0.3, cacheWrite: 0 },
  "grok46": { input: 2, output: 6, cached: 0.3, cacheWrite: 0 },
  "grokcode1|f": { input: 0.2, output: 1.5, cached: 0.02, cacheWrite: 0 },
  "hybridarena": { input: 1, output: 5, cached: 0.1, cacheWrite: 1.25 },
  "inkling": { input: 1.4, output: 4.4, cached: 0.26, cacheWrite: 0 },
  "inklingx": { input: 1.4, output: 4.4, cached: 0.26, cacheWrite: 0 },
  "kimik26": { input: 0.95, output: 4, cached: 0.16, cacheWrite: 0 },
  "kimik27": { input: 0.95, output: 4, cached: 0.19, cacheWrite: 0 },
  "kimik3": { input: 3, output: 15, cached: 0.3, cacheWrite: 0 },
  "nemotron3ultra": { input: 0.6, output: 2.4, cached: 0.12, cacheWrite: 0 },
  "o3": { input: 2, output: 8, cached: 0.5, cacheWrite: 0 },
  "o3reasoning": { input: 2, output: 8, cached: 0.5, cacheWrite: 0 },
  "opus47review": { input: 5, output: 25, cached: 0.5, cacheWrite: 6.25 },
  "penguin": { input: 0.5, output: 2.5, cached: 0.2, cacheWrite: 0 },
  "swe16": { input: 0.5, output: 2.5, cached: 0.2, cacheWrite: 0 },
  "swe16|f": { input: 0.5, output: 2.5, cached: 0.2, cacheWrite: 0 },
  "swe17": { input: 0, output: 0, cached: 0, cacheWrite: 0 },
  "swe17lightning": { input: 2.5, output: 12.5, cached: 1, cacheWrite: 0 },
  "swe2": { input: 0, output: 0, cached: 0, cacheWrite: 0 },
  "swecheck": { input: 0, output: 0, cached: 0, cacheWrite: 0 },
  "xaigrok3": { input: 3, output: 15, cached: 0, cacheWrite: 0 },
  "xaigrok3mini": { input: 0.3, output: 0.5, cached: 0, cacheWrite: 0 },
};

const EFFORT_WORDS = new Set([
  "none", "minimal", "low", "medium", "high", "xhigh", "max",
  "thinking", "fast", "priority", "1m", "m",
]);

function normKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !EFFORT_WORDS.has(w))
    .join("");
}

/** Look up USD/1M-token pricing for a family + variant flags. */
export function priceFor(
  familyLabel: string,
  fast: boolean,
  ctx1m: boolean,
): ModelPrice | null {
  const k =
    normKey(familyLabel) + (fast ? "|f" : "") + (ctx1m ? "|1m" : "");
  return TABLE[k] ?? TABLE[normKey(familyLabel)] ?? null;
}
