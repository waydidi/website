// Pure: which Claude models Non uses and what a call costs. Model ids come from Worker variables
// (AI_MODEL_FAST, AI_MODEL_SMART) so they change without a code release; the defaults are today's models.

export type ModelPair = { fast: string; smart: string };
export const DEFAULT_MODELS: ModelPair = { fast: "claude-haiku-4-5", smart: "claude-opus-5-5" };

// US$ per million tokens: [input, output, cache read, cache write]. Update together with PRICE_TABLE_VERSION.
export const PRICE_TABLE_VERSION = "2026-11-24";
export const MODEL_PRICES: Record<string, readonly [number, number, number, number]> = {
  "claude-haiku-4-5": [1, 5, 0.1, 1.25],
  "claude-opus-5-5": [4, 20, 0.2, 5],
};

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{2,80}$/;
const pick = (value: string | undefined, fallback: string) => {
  const v = value?.trim();
  return v && MODEL_ID.test(v) ? v : fallback;
};

/** Model ids from Worker variables; an empty or malformed value keeps the default. */
export function resolveModels(vars: Record<string, string | undefined>): ModelPair {
  return { fast: pick(vars.AI_MODEL_FAST, DEFAULT_MODELS.fast), smart: pick(vars.AI_MODEL_SMART, DEFAULT_MODELS.smart) };
}

export type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined;

const priced = (p: readonly number[], u: Usage) =>
  ((u?.input_tokens ?? 0) * p[0] + (u?.output_tokens ?? 0) * p[1] + (u?.cache_read_input_tokens ?? 0) * p[2] + (u?.cache_creation_input_tokens ?? 0) * p[3]) / 1e6;
const HIGHEST = Object.values(MODEL_PRICES).reduce((a, b) => (b[1] > a[1] ? b : a));

/**
 * usd: the real cost, or null when the model has no price in the table (shown as "unknown").
 * budgetUsd: what spending totals count; an unknown model is counted at the highest known price so a
 * new model can never make spending look smaller than it is.
 */
export function modelCost(model: string, usage: Usage): { usd: number | null; budgetUsd: number } {
  const p = MODEL_PRICES[model];
  return p ? { usd: priced(p, usage), budgetUsd: priced(p, usage) } : { usd: null, budgetUsd: priced(HIGHEST, usage) };
}
