import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  History,
  Home,
  Inbox,
  Layers,
  LineChart,
  Loader2,
  Play,
  ReceiptText,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { postJson, requestJson } from "./api";
import {
  allTiersConfigured,
  credentialsPayload,
  effectiveModel,
  emptyCreds,
  sessionActive,
  TIERS,
  tierConfigured,
} from "./credentials";
import type { SessionCreds } from "./credentials";
import type { Batch, Health, TriageResult } from "./types";
import type { Desk, RunRecord, TierId, TestState, View } from "./components/bits";
import { Drawer, idleTest, InfoNote, LaneBadge, ModelName, StageBadge } from "./components/bits";
import { TicketDetail } from "./components/TicketTable";
import { Overview } from "./views/Overview";
import { HowItWorks } from "./views/HowItWorks";
import { BriefView, CostView, FindingsView, HistoryView, HumanView, PatternsView, SettingsView, TicketsView } from "./views/Workspace";

const NAV: { view: View; label: string; icon: typeof Home }[] = [
  { view: "overview", label: "Overview", icon: Home },
  { view: "tickets", label: "Ticket inbox", icon: Inbox },
  { view: "human", label: "Human review", icon: Users },
  { view: "patterns", label: "Evidence & patterns", icon: LineChart },
  { view: "brief", label: "Escalation brief", icon: FileText },
  { view: "history", label: "Run history", icon: History },
  { view: "cost", label: "Cost analytics", icon: BarChart3 },
  { view: "how", label: "How it works", icon: BookOpen },
];

const TITLES: Record<View, [string, string]> = {
  how: ["How it works", "The architecture behind the desk, and how to run your first triage."],
  overview: ["Triage desk", "Resolve routine tickets. Focus human attention where it matters."],
  tickets: ["Ticket inbox", "Every synthetic ticket in the latest batch, searchable and sortable."],
  human: ["Human review", "Low confidence or credits / refunds — never auto-resolved."],
  patterns: ["Evidence & patterns", "Recurring clusters observed in synthetic data, with quoted evidence."],
  findings: ["AI findings", "Model-generated cluster analysis — verify before acting."],
  brief: ["Escalation brief", "Deterministic draft assembled from evidence — review before sending."],
  cost: ["Cost analytics", "Routed cost vs an all-Max baseline at assumed rates."],
  history: ["Run history", "Session runs with per-ticket request/response traces."],
  settings: ["Settings", "Workspace, appearance and routing policy."],
};

function readTheme(): string {
  try {
    return localStorage.getItem("costera.theme") ?? "system";
  } catch {
    return "system";
  }
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [extras, setExtras] = useState<{ ticketId: string; line: string }[]>([]);
  const [theme, setTheme] = useState(readTheme);
  const [creds, setCreds] = useState<SessionCreds>(emptyCreds);
  const [tierStatus, setTierStatusState] = useState<Record<TierId, TestState>>({
    decision: idleTest(),
    flash: idleTest(),
    max: idleTest(),
  });
  const [preflightOpen, setPreflightOpen] = useState(false);

  useEffect(() => {
    if (!preflightOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreflightOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preflightOpen]);
  const [copied, setCopied] = useState(false);
  const [logRun, setLogRun] = useState<RunRecord | null>(null);
  const [ticketOpen, setTicketOpen] = useState<string | null>(null);

  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;
      document.documentElement.setAttribute("data-theme", resolved);
    };
    apply();
    try {
      localStorage.setItem("costera.theme", theme);
    } catch {
      // storage unavailable — preference stays for this session
    }
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, b] = await Promise.all([requestJson<Health>("/api/health"), requestJson<Batch>("/api/batch")]);
        if (!h.ok || typeof h.mode !== "string") throw new Error("The site service returned an invalid status.");
        if (!b.ok || !Array.isArray(b.tickets)) throw new Error("The site service returned an invalid batch.");
        if (alive) {
          setHealth(h);
          setBatch(b);
          setSelected(b.tickets[0]?.id ?? null);
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
    if (!health || !batch) {
      setError("The triage desk is still loading. Try again in a moment.");
      return;
    }
    if (health.mode === "live" && !health.configured) {
      // Session (bring-your-own) mode: require all three tiers configured and Test-confirmed.
      const problems = TIERS.filter((t) => !tierConfigured(creds, t.id) || tierStatus[t.id].state !== "ok");
      if (problems.length > 0) {
        setPreflightOpen(true);
        return;
      }
    }
    setRunning(true);
    setError(null);
    try {
      const payload = credentialsPayload(creds);
      const r = await postJson<TriageResult>("/api/triage", {
        includeTrace: true,
        ...(payload ? { credentials: payload } : {}),
      });
      if (!r.ok || !Array.isArray(r.tickets) || !Array.isArray(r.patterns) || typeof r.brief !== "string") {
        throw new Error("The triage service returned an invalid result.");
      }
      setResult(r);
      setRuns((prev) => [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          mode: r.mode,
          keySource: r.keySource ?? (payload ? "session" : "env"),
          decisionEngine: r.decisionEngine ?? "systemone",
          models: r.models ?? { decision: "decision-model-preview", flash: "qwen3.8-flash", max: "qwen3.8-max" },
          stats: r.stats,
          trace: r.trace ?? [],
        },
        ...prev,
      ]);
      setSelected(r.humanQueue[0]?.id ?? r.tickets[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed.");
    } finally {
      setRunning(false);
    }
  }, [health, batch, creds, tierStatus]);

  const briefText = useCallback(() => {
    // The draft is deterministic server output; session marks never alter it.
    return result?.brief ?? "";
  }, [result]);

  const copyBrief = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(briefText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard. Select the text manually.");
    }
  }, [result, briefText]);

  const addBrief = useCallback((id: string) => {
    setExtras((prev) =>
      prev.some((e) => e.ticketId === id)
        ? prev
        : [...prev, { ticketId: id, line: `${id} — marked for brief review in this session (local mark only; does not change the draft).` }],
    );
  }, []);

  const removeBrief = useCallback((id: string) => {
    setExtras((prev) => prev.filter((e) => e.ticketId !== id));
  }, []);

  const openTicket = useCallback((id: string) => setTicketOpen(id), []);
  const openLog = useCallback(
    (runId?: string) => setLogRun(runs.find((r) => r.id === runId) ?? runs[0] ?? null),
    [runs],
  );

  const byo = sessionActive(creds);
  const tiersComplete = allTiersConfigured(creds);
  const canRun = Boolean(health && batch) && !running && !result;

  const desk: Desk = {
    health,
    batch,
    result,
    runs,
    running,
    error,
    canRun,
    run,
    view,
    setView,
    selected,
    setSelected,
    openTicket,
    openLog,
    extras,
    addBrief,
    removeBrief,
    theme,
    setTheme,
    creds,
    setCreds,
    tierStatus,
    setTierStatus: (t, s) => setTierStatusState((prev) => ({ ...prev, [t]: s })),
    copyBrief,
    copied,
  };

  const counts: Partial<Record<View, number>> = {
    tickets: batch?.tickets.length,
    human: result?.humanQueue.length,
    patterns: result?.patterns.length,
    history: runs.length,
  };

  const navButton = (n: (typeof NAV)[number], compact = false) => (
    <button
      key={n.view}
      type="button"
      onClick={() => setView(n.view)}
      className={`flex items-center gap-2.5 rounded-lg text-sm transition-colors ${
        compact ? "shrink-0 px-3 py-1.5 text-xs" : "w-full px-3 py-2"
      } ${
        view === n.view
          ? "bg-teal-50 font-semibold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <n.icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{n.label}</span>
      {counts[n.view] != null && (
        <span
          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
            n.view === "human"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {counts[n.view]}
        </span>
      )}
    </button>
  );

  const openTicketObj = batch?.tickets.find((t) => t.id === ticketOpen);
  const openTicketTr = result?.tickets.find((t) => t.id === ticketOpen);
  const openTicketClusterKeys = new Set(
    (result?.analyses ?? []).filter((a) => ticketOpen != null && a.ticketIds.includes(ticketOpen)).map((a) => a.key),
  );
  const ticketTrace = (runs[0]?.trace ?? []).filter(
    (t) =>
      t.ticketId === ticketOpen ||
      (t.stage === "tier2_heavy" && t.clusterKey != null && openTicketClusterKeys.has(t.clusterKey)),
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-600/25">
            <Layers className="size-4" />
          </span>
          <span className="text-lg font-bold tracking-tight">COSTERA</span>
        </div>
        <div className="px-4 pb-4">
          <div
            title="Only the synthetic demo workspace exists in this build"
            className="flex w-full items-center justify-between rounded-lg border bg-background px-2.5 py-1.5 text-xs"
          >
            ZephyrTel / Demo
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </div>
        </div>
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3" aria-label="Workspace">
          {NAV.map((n) => navButton(n))}
        </nav>
        <div className="space-y-2 border-t px-4 py-4">
          <div className="flex items-center gap-2.5 px-1">
            <Layers className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium">Demo workspace</p>
              <p className="text-[11px] text-muted-foreground">Synthetic data only</p>
            </div>
          </div>
          {navButton({ view: "settings", label: "Settings", icon: Settings })}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="flex items-center gap-2 lg:hidden">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
                <Layers className="size-3.5" />
              </span>
              <span className="text-sm font-bold tracking-tight">COSTERA</span>
            </span>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Workspace / <span className="font-medium text-foreground">{TITLES[view][0]}</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              {health?.mode === "fixture" ? (
                <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" title="Simulated classifier responses for local development — not live model calls">
                  Fixture mode
                </Badge>
              ) : byo ? (
                <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200" title="Reviewer-supplied session API key — memory only, cleared on refresh, used for this request alone">
                  <span className="size-1.5 rounded-full bg-teal-500" /> Session API key
                </Badge>
              ) : (
                <Badge variant="secondary" title="This build has no server-side key — open Settings to add your own API access">
                  Add access in Settings
                </Badge>
              )}
              <Badge variant="outline">Synthetic data</Badge>
            </div>
          </div>
          <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Workspace sections">
            {NAV.map((n) => navButton(n, true))}
            {navButton({ view: "settings", label: "Settings", icon: Settings }, true)}
          </nav>
        </header>

        <main className="space-y-5 px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{TITLES[view][0]}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{TITLES[view][1]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(view === "overview" || view === "tickets" || view === "history") && (
                <Button variant="outline" size="sm" disabled={!result} onClick={() => openLog()} title={result ? "Per-ticket request/response trace of the latest run" : "Run triage first"}>
                  <FileText /> View run log
                </Button>
              )}
              {(view === "overview" || view === "tickets") && (
                <Button
                  onClick={run}
                  disabled={!canRun}
                  size="sm"
                  className={
                    result
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500 disabled:shadow-none"
                      : "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/25 hover:from-teal-500 hover:to-emerald-500 disabled:shadow-none"
                  }
                  title={
                    result
                      ? "Triage already completed — reload the page to run again"
                      : health?.mode === "live" && !health.configured
                        ? "Opens a setup checklist until all three tiers are configured and Test-confirmed"
                        : undefined
                  }
                >
                  {result ? <Check /> : running ? <Loader2 className="animate-spin" /> : <Play />}
                  {result ? "Triage complete" : running ? "Triaging…" : `Run triage · ${batch?.tickets.length ?? 0}`}
                </Button>
              )}
            </div>
          </div>

          {view !== "how" && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-xs dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <span className="font-semibold">Demo environment — synthetic demo data.</span> All tickets, customers,
                plans and outages are fictional; patterns are observations in synthetic data — not verified network
                truth. No real customer information. <span className="font-semibold">No persistence yet:</span> this build
                has no database, so a page refresh resets the desk — the run, findings, brief, marks and history are gone
                and your API access must be entered again in Settings.
              </p>
            </div>
          )}

          {health?.mode === "fixture" && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle />
              <AlertTitle>Fixture mode — local development</AlertTitle>
              <AlertDescription>
                Classifier responses are simulated fixtures, not live model calls. The published site calls real
                models using the API access each reviewer enters in Settings.
              </AlertDescription>
            </Alert>
          )}

          {byo && !tiersComplete && (
            <InfoNote tone="amber">
              Session setup is incomplete — every tier needs a key, an HTTPS endpoint and a chosen model before triage
              can run. Open Settings to finish the setup.
            </InfoNote>
          )}

          {loadError && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Could not load the triage desk</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Triage failed</AlertTitle>
              <AlertDescription>
                {error}
                <div className="mt-2">
                  {(view === "overview" || view === "tickets") && (
                    <Button variant="outline" size="sm" onClick={run} disabled={!canRun}>
                      Retry
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {running && (
            <InfoNote>
              Classifying {batch?.tickets.length ?? 0} tickets with Tier 1, routing to the cheapest lane, then Tier 2
              where warranted…
            </InfoNote>
          )}

          {view === "how" && <HowItWorks desk={desk} />}
          {view === "overview" && <Overview desk={desk} />}
          {view === "tickets" && <TicketsView desk={desk} />}
          {view === "human" && <HumanView desk={desk} />}
          {view === "patterns" && <PatternsView desk={desk} />}
          {view === "findings" && <FindingsView desk={desk} />}
          {view === "brief" && <BriefView desk={desk} />}
          {view === "cost" && <CostView desk={desk} />}
          {view === "history" && <HistoryView desk={desk} />}
          {view === "settings" && <SettingsView desk={desk} />}

          <footer className="pb-2 pt-4 text-center text-xs text-muted-foreground">
            COSTERA bounty demo · fictional telco · all data synthetic · no real provider names or customer data
          </footer>
        </main>
      </div>

      {preflightOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preflight-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/60"
            onClick={() => setPreflightOpen(false)}
          />
          <div className="rise relative w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
            <h2 id="preflight-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <ShieldAlert className="size-4 text-amber-600" /> Finish the 3-tier AI setup first
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Triage needs all three tiers configured — a key, an HTTPS endpoint and a chosen model — each confirmed
              accessible with Test. This build holds no server-side key, so your own access is what gets used —
              fixture mode (local development) is the only run that skips this step.
            </p>
            <ul className="mt-3 space-y-2">
              {TIERS.map((t) => {
                const configured = tierConfigured(creds, t.id);
                const status = tierStatus[t.id];
                const chip = !configured
                  ? ["bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300", "Add key, endpoint & model"]
                  : status.state === "ok"
                    ? ["bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300", "Ready"]
                    : status.state === "error"
                      ? ["bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300", "Test failed — fix key or URL"]
                      : status.state === "testing"
                        ? ["bg-muted text-muted-foreground", "Testing…"]
                        : ["bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300", "Press Test to confirm access"];
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.label}
                    </span>
                    {effectiveModel(creds, t.id) ? (
                      <ModelName>{effectiveModel(creds, t.id)}</ModelName>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">no selection</span>
                    )}
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${chip[0]}`}>
                      {chip[1]}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreflightOpen(false)}>
                Not now
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setPreflightOpen(false);
                  setView("settings");
                }}
              >
                Open Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={logRun !== null}
        onClose={() => setLogRun(null)}
        wide
        title={logRun ? `Run log · ${logRun.id.slice(0, 8)}` : "Run log"}
        sub={logRun ? `${new Date(logRun.at).toLocaleString()} · ${logRun.mode} · ${logRun.trace.length} traced calls` : undefined}
      >
        {logRun && (
          <div className="space-y-3">
            <InfoNote>
              Exact request bodies and raw model responses per call. Never contains keys, headers or the endpoint
              hostname.
            </InfoNote>
            {logRun.trace.map((t, i) => (
              <div key={i} className="rounded-lg border px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={t.stage} />
                  <span className="font-mono text-xs font-semibold">{t.ticketId ?? t.clusterKey ?? "—"}</span>
                  {t.lane && <LaneBadge lane={t.lane} />}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {t.latencyMs != null ? `${t.latencyMs} ms` : "—"}
                    {t.inputTokens != null ? ` · ${t.inputTokens} in` : ""}
                    {t.outputTokens != null ? ` / ${t.outputTokens} out` : ""}
                  </span>
                </div>
                {t.reasons.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{t.reasons.join("; ")}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-teal-700 dark:text-teal-300">
                    Request body
                  </summary>
                  <pre className="scrollbar-thin mt-1 max-h-56 overflow-auto rounded-md bg-muted/60 p-2.5 font-mono text-[11px]">
                    {JSON.stringify(t.request, null, 2)}
                  </pre>
                </details>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs font-medium text-teal-700 dark:text-teal-300">
                    Raw response
                  </summary>
                  <pre className="scrollbar-thin mt-1 max-h-56 overflow-auto rounded-md bg-muted/60 p-2.5 font-mono text-[11px]">
                    {JSON.stringify(t.response, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <Drawer
        open={ticketOpen !== null}
        onClose={() => setTicketOpen(null)}
        wide
        title={ticketOpen ?? "Ticket"}
        sub={openTicketTr ? `${openTicketTr.intent ?? "unclassified"} · routed ${openTicketTr.lane}` : "Not routed yet"}
      >
        <div className="space-y-5">
          <TicketDetail
            ticket={openTicketObj}
            tr={openTicketTr}
            result={result}
            onOpen={(id) => setTicketOpen(id)}
            onAdd={addBrief}
            added={extras.some((e) => e.ticketId === ticketOpen)}
            onViewFindings={() => {
              setTicketOpen(null);
              setView("findings");
            }}
          />
          {ticketTrace.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Run trace for this ticket
              </h4>
              {ticketTrace.some((t) => t.stage === "tier2_heavy") && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tier 2 heavy runs per cluster, not per ticket — the Max call below covers this ticket's analysed
                  cluster.
                </p>
              )}
              <div className="mt-2 space-y-2">
                {ticketTrace.map((t, i) => (
                  <div key={i} className="rounded-lg border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StageBadge stage={t.stage} />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {t.latencyMs != null ? `${t.latencyMs} ms` : "—"}
                      </span>
                    </div>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs font-medium text-teal-700 dark:text-teal-300">
                        Request / response
                      </summary>
                      <pre className="scrollbar-thin mt-1 max-h-64 overflow-auto rounded-md bg-muted/60 p-2.5 font-mono text-[11px]">
                        {JSON.stringify({ request: t.request, response: t.response }, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
          {openTicketTr?.summary && (
            <InfoNote>
              Summary above generated by <ModelName>qwen3.8-flash</ModelName> — model output, verify before use.
            </InfoNote>
          )}
        </div>
      </Drawer>
    </div>
  );
}