import { Brain, Database, Route, ScanSearch, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { computeCost, DEFAULT_RATES, laneCosts, ratesForModels } from "../cost";
import { modelById } from "../models";
import type { RunModels } from "../models";
import type { TriageStats } from "../types";
import { ModelName, tok, usd } from "./bits";

// One paper recipe for every lane card — the lane name carries the meaning,
// not a per-tier hue (Cobalt: one signal, semantic status ink only).
function ModelCard({
  tier,
  model,
  emptyText,
  role,
  usage,
  cost,
  icon: Icon,
}: {
  tier: string;
  model: string | null;
  emptyText: string;
  role: string;
  usage: string | null;
  cost: number | null;
  icon: typeof Database;
}) {
  return (
    <div className="cut-sm bg-paper px-3.5 py-3 shadow-[var(--shadow-card)] sm:px-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
        <Icon className="size-3.5" />
        {tier}
      </p>
      <p className="mt-1.5 break-all font-mono text-sm">
        {model ? <ModelName>{model}</ModelName> : <span className="text-muted-foreground">{emptyText}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{role}</p>
      {usage !== null && cost !== null ? (
        <div className="mt-2 border-t border-rule pt-2">
          <p className="text-[11px] text-muted-foreground">{usage}</p>
          <p className="mt-0.5 font-mono text-sm font-semibold">
            ≈ {usd(cost)} <span className="font-sans text-[11px] font-normal text-muted-foreground">est.</span>
          </p>
        </div>
      ) : (
        <p className="mt-2 border-t border-rule pt-2 text-[11px] italic text-muted-foreground">
          Usage and cost appear after a run.
        </p>
      )}
    </div>
  );
}

export function ModelCost({
  stats,
  models,
  session,
}: {
  stats: TriageStats | null;
  models?: RunModels;
  // what the reviewer has chosen in Settings, used before any run exists
  session?: RunModels;
}) {
  const rates = ratesForModels(models);
  const cost = stats ? computeCost(stats, rates) : null;
  const lanes = stats ? laneCosts(stats, rates) : null;
  const ms = (v: number | null) => (v !== null ? `${v} ms avg` : "latency n/a");
  // after a run the models are the ones that ran; before one, whatever Settings holds
  const decisionModel = models?.decision || session?.decision || null;
  const flashModel = models?.flash || session?.flash || null;
  const maxModel = models?.max || session?.max || null;
  const rateNote = (id: string | null, roleIn: number, roleOut: number) => {
    const m = id ? modelById(id) : undefined;
    return m ? `$${m.in.toFixed(2)}/$${m.out.toFixed(2)}` : `$${roleIn.toFixed(2)}/$${roleOut.toFixed(2)} (assumed role rate)`;
  };
  const cards = [
    {
      tier: "Direct / code lane",
      model: null as string | null,
      empty: "No model call: deterministic lookup",
      role: "Deterministic lookups: plans, accounts, outages. Zero model tokens.",
      usage: stats ? `${stats.lanes.direct ?? 0} tickets, 0 tokens` : null,
      cost: lanes ? lanes.direct : null,
      icon: Database,
    },
    {
      tier: "Tier 1 classifier",
      model: decisionModel,
      empty: "Not chosen yet. Set it in Settings.",
      role: "Reads every ticket: intent + complexity with confidence, then routes it.",
      usage: stats ? `${stats.tier1Calls} calls, ${tok(stats.inputTokens)} tok in, ${ms(stats.avgLatencyMs)}` : null,
      cost: lanes ? lanes.tier1 : null,
      icon: ScanSearch,
    },
    {
      tier: "Tier 2 light",
      model: flashModel,
      empty: "Not chosen yet. Set it in Settings.",
      role: "Plain-language summaries for the escalation set and human queue.",
      usage: stats
        ? `${stats.tier2.light.calls} calls, ${tok(stats.tier2.light.inputTokens)} in / ${tok(stats.tier2.light.outputTokens)} out, ${ms(stats.tier2.light.avgLatencyMs)}`
        : null,
      cost: lanes ? lanes.flash : null,
      icon: Zap,
    },
    {
      tier: "Tier 2 heavy",
      model: maxModel,
      empty: "Not chosen yet. Set it in Settings.",
      role: "Cross-ticket cluster analysis, only clusters that warrant it.",
      usage: stats
        ? `${stats.tier2.heavy.calls} calls, ${tok(stats.tier2.heavy.inputTokens)} in / ${tok(stats.tier2.heavy.outputTokens)} out, ${ms(stats.tier2.heavy.avgLatencyMs)}`
        : null,
      cost: lanes ? lanes.max : null,
      icon: Brain,
    },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Route className="size-3.5 text-ink-3" />
          Models &amp; cost routing
        </h3>
        <p className="text-xs text-muted-foreground">
          Cheapest lane that can finish the job; flagship only when a cluster warrants it
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <ModelCard
            key={c.tier}
            tier={c.tier}
            model={c.model}
            emptyText={c.empty}
            role={c.role}
            usage={c.usage}
            cost={c.cost}
            icon={c.icon}
          />
        ))}
      </div>
      {cost && (
        <div className="cut-sm mt-4 bg-paper-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-ink-3">
              What routing saved on this run
            </h4>
            <Badge variant="outline">estimate</Badge>
          </div>
          <p className="measure mt-2 text-sm">
            The baseline below is what this same work would cost if every step went to{" "}
            {maxModel ? (
              <ModelName>{maxModel}</ModelName>
            ) : (
              <span className="font-medium">the heaviest model you configured</span>
            )}
            , the strongest and most expensive model in this run. The router instead sends each step to the cheapest
            model that can finish it: no model for deterministic lookups, the classifier for decisions, the light lane
            for summaries, the heavy lane only for warranted clusters. The gap between the two bars is what routing
            saved.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="space-y-2.5">
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Routed: the actual model mix used</span>
                  <span className="font-mono text-xs font-semibold text-foreground">{usd(cost.routed)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-[2px] bg-paper-3">
                  <div
                    className="h-full rounded-[2px] bg-ok"
                    style={{ width: `${cost.baseline > 0 ? Math.max(2, (cost.routed / cost.baseline) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>All-flagship baseline: same work, everything on {maxModel ?? "the heavy lane model"}</span>
                  <span className="font-mono text-xs font-semibold text-foreground">{usd(cost.baseline)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-[2px] bg-paper-3">
                  <div className="h-full w-full rounded-[2px] bg-error" />
                </div>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
              <p className="text-xs text-muted-foreground">Saved by routing</p>
              <p className="font-mono text-2xl font-semibold text-ok">
                {cost.savingsPct !== null ? `${cost.savingsPct.toFixed(0)}%` : "n/a"}
              </p>
              <p className="text-[11px] text-muted-foreground">≈ {usd(cost.baseline - cost.routed)} avoided</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Estimates at assumed rates per million tokens (in/out): {decisionModel ?? "classifier"}{" "}
            {rateNote(decisionModel, DEFAULT_RATES.decisionIn, DEFAULT_RATES.decisionOut)}, {flashModel ?? "light lane"}{" "}
            {rateNote(flashModel, DEFAULT_RATES.flashIn, DEFAULT_RATES.flashOut)}, {maxModel ?? "heavy lane"}{" "}
            {rateNote(maxModel, DEFAULT_RATES.maxIn, DEFAULT_RATES.maxOut)}. Tier 1 reports input tokens only; the
            direct lane uses no model. Not billing truth.
          </p>
        </div>
      )}
    </div>
  );
}