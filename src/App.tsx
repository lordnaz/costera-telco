import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  Copy,
  Database,
  Hash,
  Inbox,
  LifeBuoy,
  ListChecks,
  Loader2,
  Play,
  RadioTower,
  Route,
  ScanSearch,
  ShieldAlert,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { postJson, requestJson } from "./api";
import { computeCost, DEFAULT_RATES, laneCosts } from "./cost";
import type { Batch, Health, Pattern, TicketResult, TriageResult, TriageStats } from "./types";

function ModeBadge({ health }: { health: Health | null }) {
  if (!health) return <Badge variant="outline">Connecting…</Badge>;
  if (health.mode === "fixture") {
    return (
      <Badge
        className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        title="Simulated classifier responses for local development — not live model calls"
      >
        Fixture mode
      </Badge>
    );
  }
  if (health.configured) {
    return (
      <Badge
        className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        title="Real model calls via server-side secrets"
      >
        Live
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" title="Server secrets are missing — triage is disabled until the owner sets them">
      Not configured
    </Badge>
  );
}

function LaneBadge({ lane }: { lane: TicketResult["lane"] }) {
  if (lane === "direct")
    return (
      <Badge variant="secondary" title="Deterministic knowledge-base lookup — no generation call">
        Direct lane
      </Badge>
    );
  if (lane === "human_review")
    return (
      <Badge variant="destructive" title="Handed to a human — never auto-resolved">
        Human review
      </Badge>
    );
  if (lane === "tier2_candidate")
    return (
      <Badge variant="outline" title="Escalated to Tier 2: flash summary, and Max analysis if the cluster warrants it">
        Tier 2 candidate
      </Badge>
    );
  return (
    <Badge variant="destructive" title="Classification failed for this ticket — see run log">
      Error
    </Badge>
  );
}

function Confidence({ value, probabilities }: { value: number | null; probabilities?: Record<string, number> | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const tone = value < 0.7 ? "bg-amber-500" : "bg-emerald-600";
  const tip = probabilities
    ? `decision-model-preview · ${Object.entries(probabilities)
        .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
        .join(" · ")}`
    : "decision-model-preview";
  return (
    <span className="inline-flex items-center gap-2" title={tip}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs">{pct}%</span>
    </span>
  );
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{pattern.title}</CardTitle>
        <CardAction>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge>{pattern.count} tickets</Badge>
            <Badge variant="outline">{pattern.distinctCustomers} customers</Badge>
            <Badge variant="outline">min conf {Math.round(pattern.confidenceMin * 100)}%</Badge>
          </div>
        </CardAction>
        <CardDescription>
          Tier 1 classifier <span className="model-name font-mono">decision-model-preview</span> · avg confidence{" "}
          {Math.round(pattern.confidenceAvg * 100)}% · intent: {pattern.intent}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {pattern.evidence.map((e) => (
            <li key={e.ticketId} className="text-sm">
              <span className="mr-2 font-mono text-xs text-muted-foreground">{e.ticketId}</span>
              <span className="italic">“{e.line}”</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          All tickets: <span className="font-mono">{pattern.ticketIds.join(", ")}</span>
        </p>
        <p className="text-xs italic text-muted-foreground">{pattern.note}</p>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Inbox;
  tone: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`flex size-5 items-center justify-center rounded ${t.chip}`}>
          <Icon className="size-3" />
        </span>
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

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
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${t.card}`}>
      <p className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${t.label}`}>
        <span className={`flex size-6 items-center justify-center rounded-md ${t.chip}`}>
          <Icon className="size-3.5" />
        </span>
        {tier}
      </p>
      <p className="mt-1.5 font-mono text-sm">
        {model ? (
          <span className="model-name">{model}</span>
        ) : (
          <span className="text-muted-foreground">no model call</span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{role}</p>
      {usage !== null && cost !== null ? (
        <div className={`mt-2 border-t pt-2 ${t.rule}`}>
          <p className="text-[11px] text-muted-foreground">{usage}</p>
          <p className="mt-0.5 font-mono text-sm font-semibold">
            ≈ ${cost.toFixed(4)}{" "}
            <span className="font-sans text-[10px] font-normal text-muted-foreground">est.</span>
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

function ModelsAndCost({ stats }: { stats: TriageStats | null }) {
  const cost = stats ? computeCost(stats, DEFAULT_RATES) : null;
  const lanes = stats ? laneCosts(stats, DEFAULT_RATES) : null;
  const tok = (n: number) => n.toLocaleString("en-US");
  const ms = (v: number | null) => (v !== null ? `${v} ms avg` : "latency n/a");
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
      model: "decision-model-preview",
      role: "Reads every ticket: intent + complexity with confidence, then routes it.",
      usage: stats ? `${stats.tier1Calls} calls · ${tok(stats.inputTokens)} tok in · ${ms(stats.avgLatencyMs)}` : null,
      cost: lanes ? lanes.tier1 : null,
      tone: "violet" as Tone,
      icon: ScanSearch,
    },
    {
      tier: "Tier 2 · light",
      model: "qwen3.8-flash",
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
      model: "qwen3.8-max",
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
    <section aria-label="Models and cost routing" className="panel px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Route className="size-3.5" />
          </span>
          Models &amp; cost routing
        </h2>
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What routing saved on this run
            </h3>
            <Badge variant="outline">estimate</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm">
            The baseline below is what this same work would cost if every step went to{" "}
            <span className="model-name font-mono">qwen3.8-max</span>, the strongest and most expensive model. The
            router instead sends each step to the cheapest model that can finish it — no model for deterministic
            lookups, the cheap classifier for decisions, flash for summaries, Max only for warranted clusters. The gap
            between the two bars is what routing saved.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="space-y-2.5">
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Routed — the actual model mix used</span>
                  <span className="font-mono text-xs font-semibold text-foreground">${cost.routed.toFixed(4)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{
                      width: `${cost.baseline > 0 ? Math.max(2, (cost.routed / cost.baseline) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>All-Max baseline — same work, everything on Max</span>
                  <span className="font-mono text-xs font-semibold text-foreground">${cost.baseline.toFixed(4)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-full rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-muted-foreground">Saved by routing</p>
              <p className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text font-mono text-2xl font-semibold text-transparent dark:from-emerald-400 dark:to-teal-300">
                {cost.savingsPct !== null ? `${cost.savingsPct.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">≈ ${(cost.baseline - cost.routed).toFixed(4)} avoided</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Estimates at assumed rates per million tokens (in/out): decision-model-preview $0.30/$0.60 · qwen3.8-flash
            $0.10/$0.40 · qwen3.8-max $1.60/$6.40. Tier 1 reports input tokens only; the direct lane uses no model. Not
            billing truth.
          </p>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, b] = await Promise.all([
          requestJson<Health>("/api/health"),
          requestJson<Batch>("/api/batch"),
        ]);
        if (!h.ok || typeof h.mode !== "string") throw new Error("The site service returned an invalid status.");
        if (!b.ok || !Array.isArray(b.tickets)) throw new Error("The site service returned an invalid batch.");
        if (alive) {
          setHealth(h);
          setBatch(b);
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Failed to load the triage desk.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await postJson<TriageResult>("/api/triage", {});
      if (!r.ok || !Array.isArray(r.tickets) || !Array.isArray(r.patterns) || typeof r.brief !== "string") {
        throw new Error("The triage service returned an invalid result.");
      }
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed.");
    } finally {
      setRunning(false);
    }
  }, []);

  const copyBrief = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard. Select the text manually.");
    }
  }, [result]);

  const canRun =
    Boolean(health && batch && (health.mode === "fixture" || health.configured)) && !running && !result;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-6 py-3.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/25">
            <RadioTower className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Triage Desk</h1>
            <p className="text-xs text-muted-foreground">ZephyrTel (fictional) · support-agent triage</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeBadge health={health} />
            <Badge variant="outline">Synthetic data</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-6 py-6">
        <section
          aria-label="About this tool"
          className="panel relative grid gap-5 overflow-hidden px-6 py-5 sm:grid-cols-3"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-violet-500/10 to-transparent dark:from-violet-400/10"
          />
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <Users className="size-3.5" />
              </span>
              Who it's for
            </h2>
            <p className="mt-1.5 text-sm">
              Support agents at a fictional telco (ZephyrTel) — one agent, one ticket batch, one loop.
            </p>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <LifeBuoy className="size-3.5" />
              </span>
              Problem it solves
            </h2>
            <p className="mt-1.5 text-sm">
              The same complaint arrives as scattered tickets. The desk pieces them into evidenced patterns and a
              ready-to-send escalation brief, routing each step to the cheapest model that can do it — and handing off
              to a human when it isn't sure.
            </p>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <ListChecks className="size-3.5" />
              </span>
              How to use
            </h2>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm">
              <li>
                Press <span className="font-medium">Run triage</span> on the synthetic batch.
              </li>
              <li>Review patterns, unsure flags and Tier 2 findings.</li>
              <li>Copy the draft brief, or work the human queue.</li>
            </ol>
          </div>
        </section>

        <div
          role="note"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-xs dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-semibold">Synthetic demo data.</span> All tickets, customers, plans and outages are
            fictional; patterns are observations in synthetic data — not verified network truth.
          </p>
        </div>

        <ModelsAndCost stats={result?.stats ?? null} />

        {health?.mode === "fixture" && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle />
            <AlertTitle>Fixture mode — local development</AlertTitle>
            <AlertDescription>
              Classifier responses are simulated fixtures, not live model calls. The published site uses the real Tier 1
              model once server secrets are set.
            </AlertDescription>
          </Alert>
        )}

        {health && health.mode === "live" && !health.configured && (
          <Alert>
            <ShieldAlert />
            <AlertTitle>Service not configured</AlertTitle>
            <AlertDescription>
              The triage engine needs server-side API secrets. The site owner must enter them in Sites Settings; they are
              never exposed to the browser.
            </AlertDescription>
          </Alert>
        )}

        {loadError && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Could not load the triage desk</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Ticket inbox</CardTitle>
              <CardAction>
                <Button
                  onClick={run}
                  disabled={!canRun}
                  size="sm"
                  className={
                    result
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500 disabled:shadow-none"
                      : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/25 hover:from-violet-500 hover:to-indigo-500 disabled:shadow-none"
                  }
                  title={result ? "Triage already completed — reload the page to run again" : undefined}
                >
                  {result ? <Check /> : running ? <Loader2 className="animate-spin" /> : <Play />}
                  {result ? "Triage complete" : running ? "Triaging…" : `Run triage · ${batch?.tickets.length ?? 0}`}
                </Button>
              </CardAction>
              <CardDescription>{batch ? batch.batchLabel : "Loading batch…"}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[62vh] divide-y overflow-y-auto scrollbar-thin">
                {batch?.tickets.map((t) => (
                  <div key={t.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{t.id}</span>
                      <Badge variant="outline" className="text-[10px]">{t.channel}</Badge>
                      <span className="ml-auto text-[11px] text-muted-foreground">{t.createdAt.slice(0, 10)}</span>
                    </div>
                    <p className="mt-1 text-sm">{t.text}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{t.customer}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <section className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Triage failed</AlertTitle>
                <AlertDescription>
                  {error}
                  <div className="mt-2">
                    <Button variant="outline" size="sm" onClick={run} disabled={!canRun}>
                      Retry
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {running && (
              <Card>
                <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Classifying {batch?.tickets.length ?? 0} tickets with Tier 1, routing to the cheapest lane, then Tier 2
                  where warranted…
                </CardContent>
              </Card>
            )}

            {!result && !running && !error && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What happens when you run triage</CardTitle>
                  <CardDescription>The engine's ladder, cheapest lane first:</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    <li>Load the synthetic ticket batch (already in the inbox).</li>
                    <li>
                      Tier 1 classifier (<span className="model-name font-mono">decision-model-preview</span>) reads
                      intent and confidence. Routine work goes to the deterministic direct lane — no generation call.
                    </li>
                    <li>
                      Unsure tickets (&lt;70% confidence) and anything touching credits/refunds go to human review;
                      complex tickets with no deterministic answer become Tier 2 candidates.
                    </li>
                    <li>
                      Tier 2: <span className="model-name font-mono">qwen3.8-flash</span> writes plain-language
                      summaries for the escalation set; <span className="model-name font-mono">qwen3.8-max</span>{" "}
                      analyses only warranted clusters (high-volume or ambiguous), citing ticket IDs as evidence.
                    </li>
                    <li>
                      You get evidenced patterns, model-labelled Tier 2 findings, an informed human queue and a draft
                      escalation brief. Every ticket's request and response is logged per run.
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {result && !running && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Tickets" value={String(result.stats.tickets)} icon={Inbox} tone="violet" />
                  <Stat label="Tier 1 calls" value={String(result.stats.tier1Calls)} icon={ScanSearch} tone="violet" />
                  <Stat label="Input tokens" value={String(result.stats.inputTokens)} icon={Hash} tone="sky" />
                  <Stat
                    label="Avg Tier 1 latency"
                    value={result.stats.avgLatencyMs !== null ? `${result.stats.avgLatencyMs} ms` : "—"}
                    icon={Timer}
                    tone="emerald"
                  />
                </div>

                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Recurring patterns · {result.patterns.length}
                  </h2>
                  {result.patterns.length === 0 && (
                    <p className="text-sm text-muted-foreground">No cluster reached the 3-ticket threshold.</p>
                  )}
                  {result.patterns.map((p) => (
                    <PatternCard key={p.key} pattern={p} />
                  ))}
                </div>

                {result.analyses.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Tier 2 findings · {result.analyses.length}
                      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        model-generated
                      </Badge>
                    </h2>
                    {result.analyses.map((a) => (
                      <Card key={a.key}>
                        <CardHeader>
                          <CardTitle className="text-base">{a.title}</CardTitle>
                          <CardAction>
                            <Badge variant="outline">{a.count} tickets</Badge>
                          </CardAction>
                          <CardDescription>
                            Model-generated (<span className="model-name font-mono">{a.model}</span>) — verify before
                            acting.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <p>{a.summary}</p>
                          {a.likelyCause && (
                            <p>
                              <span className="font-medium">Likely cause:</span> {a.likelyCause}
                            </p>
                          )}
                          {a.nextStep && (
                            <p>
                              <span className="font-medium">Next step:</span> {a.nextStep}
                            </p>
                          )}
                          {a.caveats && <p className="text-xs italic text-muted-foreground">{a.caveats}</p>}
                          <p className="font-mono text-xs text-muted-foreground">{a.ticketIds.join(", ")}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {result.humanQueue.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldAlert className="size-4" /> Human review queue · {result.humanQueue.length}
                      </CardTitle>
                      <CardDescription>Low-confidence or credits/refunds — do not auto-resolve.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5 text-sm">
                        {result.humanQueue.map((h) => (
                          <li key={h.id}>
                            <span className="mr-2 font-mono text-xs font-semibold">{h.id}</span>
                            <span className="text-muted-foreground">{h.reasons.join("; ")}</span>
                            {h.summary && (
                              <p
                                className="mt-0.5 text-xs italic text-muted-foreground"
                                title="Tier 2 light · generated by qwen3.8-flash — model output, verify before use"
                              >
                                Summary (<span className="model-name font-mono">qwen3.8-flash</span>): {h.summary}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Every ticket, routed</CardTitle>
                    <CardDescription>
                      Tier 1 classifier <span className="model-name font-mono">decision-model-preview</span> · Lane
                      counts:{" "}
                      {Object.entries(result.stats.lanes).map(([k, v]) => `${k} ${v}`).join(" · ")} · Tier 2 light{" "}
                      {result.stats.tier2.light.calls} / heavy {result.stats.tier2.heavy.calls}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket</TableHead>
                          <TableHead>Intent</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Lane</TableHead>
                          <TableHead>Flags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.tickets.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-xs">{t.id}</TableCell>
                            <TableCell>{t.intent ?? "—"}</TableCell>
                            <TableCell><Confidence value={t.confidence} probabilities={t.probabilities} /></TableCell>
                            <TableCell><LaneBadge lane={t.lane} /></TableCell>
                            <TableCell className="max-w-56 whitespace-normal text-xs text-muted-foreground">
                              {t.unsure && (
                                <Badge
                                  className="mb-1 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                  title="decision-model-preview returned confidence below the 70% floor"
                                >
                                  Tier 1 unsure
                                </Badge>
                              )}
                              {t.reasons.join(" ")}
                              {t.summary && (
                                <p
                                  className="mt-1 italic"
                                  title="Tier 2 light · generated by qwen3.8-flash — model output, verify before use"
                                >
                                  Summary (<span className="model-name font-mono">qwen3.8-flash</span>): {t.summary}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Draft escalation brief</CardTitle>
                    <CardAction>
                      <Button variant="outline" size="sm" onClick={copyBrief}>
                        {copied ? <Check /> : <Copy />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </CardAction>
                    <CardDescription>
                      Assembled deterministically from evidence — review before sending.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/60 p-4 font-mono text-xs leading-relaxed scrollbar-thin">
                      {result.brief}
                    </pre>
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        </div>
      </main>

      <Separator />
      <footer className="py-4 text-center text-xs text-muted-foreground">
        COSTERA bounty demo · fictional telco · all data synthetic · no real provider names or customer data
      </footer>
    </div>
  );
}