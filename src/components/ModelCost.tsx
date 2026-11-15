import { Brain, Database, Route, ScanSearch, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { computeCost, DEFAULT_RATES, laneCosts, ratesForModels } from "../cost";
import { modelById } from "../models";
import type { RunModels } from "../models";
import type { TriageStats } from "../types";
import { ModelName, tok, usd } from "./bits";

const TONES = {
  emerald: {
    card: "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/25",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    label: "text-emerald-700 dark:text-emerald-300",
    rule: "border-emerald-200/70 dark:border-emerald-900/50",
  },
  violet: {
    card: "border-violet-200/80 bg-violet-50/60 dark:border-violet-900/60 dark:bg-violet-950/25",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
    label: "text-violet-700 dark:text-violet-300",
    rule: "border-violet-200/70 dark:border-violet-900/50",
  },
  sky: {
    card: "border-sky-200/80 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/25",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
    label: "text-sky-700 dark:text-sky-300",
    rule: "border-sky-200/70 dark:border-sky-900/50",
  },
  fuchsia: {
    card: "border-fuchsia-200/80 bg-fuchsia-50/60 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/25",
    chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-300",
    label: "text-fuchsia-700 dark:text-fuchsia-300",
    rule: "border-fuchsia-200/70 dark:border-fuchsia-900/50",
  },
} as const;

type Tone = keyof typeof TONES;

function ModelCard({
  tier,
  model,
  role,
  usage,
  cost,
  tone,
  icon: Icon,
}: {
  tier: string;
  model: string | null;
  role: string;
  usage: string | null;
  cost: number | null;
  tone: Tone;
  icon: typeof Database;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-xs ${t.card}`}>
      <p className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${t.label}`}>
        <span className={`flex size-6 items-center justify-center rounded-md ${t.chip}`}>
          <Icon className="size-3.5" />
        </span>
        {tier}
      </p>
      <p className="mt-1.5 font-mono text-sm">
        {model ? <ModelName>{model}</ModelName> : <span className="text-muted-foreground">no model call</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{role}</p>
      {usage !== null && cost !== null ? (
        <div className={`mt-2 border-t pt-2 ${t.rule}`}>
          <p className="text-[11px] text-muted-foreground">{usage}</p>
          <p className="mt-0.5 font-mono text-sm font-semibold">
            ≈ {usd(cost)} <span className="font-sans text-[10px] font-normal text-muted-foreground">est.</span>
          </p>
        </div>
      ) : (
        <p className={`mt-2 border-t pt-2 text-[11px] italic text-muted-foreground ${t.rule}`}>
          Usage and cost appear after a run.
        </p>
      )}
    </div>
  );
}

export function ModelCost({ stats, models }: { stats: TriageStats | null; models?: RunModels }) {
  const rates = ratesForModels(models);
  const cost = stats ? computeCost(stats, rates) : null;
  const lanes = stats ? laneCosts(stats, rates) : null;
  const ms = (v: number | null) => (v !== null ? `${v} ms avg` : "latency n/a");
  const rateNote = (id: string | undefined, roleIn: number, roleOut: number) => {
    const m = id ? modelById(id) : undefined;
    return m ? `$${m.in.toFixed(2)}/$${m.out.toFixed(2)}` : `$${roleIn.toFixed(2)}/$${roleOut.toFixed(2)} (assumed role rate)`;
  };
  const cards = [
    {
      tier: "Direct · code lane",
      model: null as string | null,
      role: "Deterministic lookups: plans, accounts, outages. Zero model tokens.",
      usage: stats ? `${stats.lanes.direct ?? 0} tickets · 0 tokens` : null,
      cost: lanes ? lanes.direct : null,
      tone: "emerald" as Tone,
      icon: Database,
    },
    {
      tier: "Tier 1 · classifier",
      model: models?.decision ?? "decision-model-preview",
      role: "Reads every ticket: intent + complexity with confidence, then routes it.",
      usage: stats ? `${stats.tier1Calls} calls · ${tok(stats.inputTokens)} tok in · ${ms(stats.avgLatencyMs)}` : null,
      cost: lanes ? lanes.tier1 : null,
      tone: "violet" as Tone,
      icon: ScanSearch,
    },
    {
      tier: "Tier 2 · light",
      model: models?.flash ?? "qwen3.8-flash",
      role: "Plain-language summaries for the escalation set and human queue.",
      usage: stats
        ? `${stats.tier2.light.calls} calls · ${tok(stats.tier2.light.inputTokens)} in / ${tok(stats.tier2.light.outputTokens)} out · ${ms(stats.tier2.light.avgLatencyMs)}`
        : null,
      cost: lanes ? lanes.flash : null,
      tone: "sky" as Tone,
      icon: Zap,
    },
    {
      tier: "Tier 2 · heavy",
      model: models?.max ?? "qwen3.8-max",
      role: "Cross-ticket cluster analysis — only clusters that warrant it.",
      usage: stats
        ? `${stats.tier2.heavy.calls} calls · ${tok(stats.tier2.heavy.inputTokens)} in / ${tok(stats.tier2.heavy.outputTokens)} out · ${ms(stats.tier2.heavy.avgLatencyMs)}`
        : null,
      cost: lanes ? lanes.max : null,
      tone: "fuchsia" as Tone,
      icon: Brain,
    },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Route className="size-3.5" />
          </span>
          Models &amp; cost routing
        </h3>
        <p className="text-xs text-muted-foreground">
          Cheapest lane that can finish the job · Max only when a cluster warrants it
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <ModelCard
            key={c.tier}
            tier={c.tier}
            model={c.model}
            role={c.role}
            usage={c.usage}
            cost={c.cost}
            tone={c.tone}
            icon={c.icon}
          />
        ))}
      </div>
      {cost && (
        <div className="mt-4 rounded-xl border bg-muted/40 p-4 dark:bg-muted/20">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What routing saved on this run
            </h4>
            <Badge variant="outline">estimate</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm">
            The baseline below is what this same work would cost if every step went to{" "}
            <ModelName>{models?.max ?? "qwen3.8-max"}</ModelName>, the strongest and most expensive model configured for
            this run. The router instead sends each step to the cheapest model that can finish it — no model for
            deterministic lookups, the cheap classifier for decisions, flash for summaries, Max only for warranted
            clusters. The gap between the two bars is what routing saved.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="space-y-2.5">
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Routed — the actual model mix used</span>
                  <span className="font-mono text-xs font-semibold text-foreground">{usd(cost.routed)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{ width: `${cost.baseline > 0 ? Math.max(2, (cost.routed / cost.baseline) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>All-flagship baseline — same work, everything on {models?.max ?? "qwen3.8-max"}</span>
                  <span className="font-mono text-xs font-semibold text-foreground">{usd(cost.baseline)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-full rounded-full bg-red-400 dark:bg-red-500" />
                </div>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-muted-foreground">Saved by routing</p>
              <p className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text font-mono text-2xl font-semibold text-transparent dark:from-emerald-400 dark:to-teal-300">
                {cost.savingsPct !== null ? `${cost.savingsPct.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">≈ {usd(cost.baseline - cost.routed)} avoided</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Estimates at assumed rates per million tokens (in/out): {models?.decision ?? "decision-model-preview"}{" "}
            {rateNote(models?.decision, DEFAULT_RATES.decisionIn, DEFAULT_RATES.decisionOut)} ·{" "}
            {models?.flash ?? "qwen3.8-flash"} {rateNote(models?.flash, DEFAULT_RATES.flashIn, DEFAULT_RATES.flashOut)} ·{" "}
            {models?.max ?? "qwen3.8-max"} {rateNote(models?.max, DEFAULT_RATES.maxIn, DEFAULT_RATES.maxOut)}. Tier 1
            reports input tokens only; the direct lane uses no model. Not billing truth.
          </p>
        </div>
      )}
    </div>
  );
}