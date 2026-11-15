// M3 cost math. Rates are fixed ASSUMPTIONS (private MaaS endpoint has no public price list);
// the UI labels every figure as an estimate, not billing truth.
import type { TriageStats } from "./types";
import { modelById } from "./models.ts";
import type { RunModels } from "./models.ts";

export interface Rates {
  decisionIn: number;
  decisionOut: number;
  flashIn: number;
  flashOut: number;
  maxIn: number;
  maxOut: number;
}

// USD per million tokens, assumed proxies from public Qwen-class pricing.
export const DEFAULT_RATES: Rates = {
  decisionIn: 0.3,
  decisionOut: 0.6,
  flashIn: 0.1,
  flashOut: 0.4,
  maxIn: 1.6,
  maxOut: 6.4,
};

export interface CostBreakdown {
  routed: number;
  baseline: number;
  savingsPct: number | null;
}

export function computeCost(stats: TriageStats, rates: Rates): CostBreakdown {
  const m = 1e6;
  const routed =
    (stats.inputTokens * rates.decisionIn +
      stats.tier2.light.inputTokens * rates.flashIn +
      stats.tier2.light.outputTokens * rates.flashOut +
      stats.tier2.heavy.inputTokens * rates.maxIn +
      stats.tier2.heavy.outputTokens * rates.maxOut) /
    m;
  const totalIn = stats.inputTokens + stats.tier2.light.inputTokens + stats.tier2.heavy.inputTokens;
  const totalOut = stats.tier2.light.outputTokens + stats.tier2.heavy.outputTokens;
  const baseline = (totalIn * rates.maxIn + totalOut * rates.maxOut) / m;
  return {
    routed,
    baseline,
    savingsPct: baseline > 0 ? (1 - routed / baseline) * 100 : null,
  };
}

export interface LaneCosts {
  direct: number;
  tier1: number;
  flash: number;
  max: number;
}

// Rates follow the models actually used in the run, so an all-flagship configuration
// prices differently from a tiered one. Unknown/custom IDs fall back to role defaults.
export function ratesForModels(models: RunModels | undefined, fallback: Rates = DEFAULT_RATES): Rates {
  if (!models) return { ...fallback };
  const pick = (id: string, roleIn: number, roleOut: number) => {
    const m = modelById(id);
    return m ? { in: m.in, out: m.out } : { in: roleIn, out: roleOut };
  };
  const d = pick(models.decision, fallback.decisionIn, fallback.decisionOut);
  const f = pick(models.flash, fallback.flashIn, fallback.flashOut);
  const x = pick(models.max, fallback.maxIn, fallback.maxOut);
  return {
    decisionIn: d.in,
    decisionOut: d.out,
    flashIn: f.in,
    flashOut: f.out,
    maxIn: x.in,
    maxOut: x.out,
  };
}

export function laneCosts(stats: TriageStats, rates: Rates): LaneCosts {
  const m = 1e6;
  return {
    direct: 0,
    tier1: (stats.inputTokens * rates.decisionIn) / m,
    flash:
      (stats.tier2.light.inputTokens * rates.flashIn + stats.tier2.light.outputTokens * rates.flashOut) / m,
    max: (stats.tier2.heavy.inputTokens * rates.maxIn + stats.tier2.heavy.outputTokens * rates.maxOut) / m,
  };
}