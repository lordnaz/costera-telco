import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  History,
  Home,
  Hourglass,
  Inbox,
  KeyRound,
  Layers,
  LineChart,
  Loader2,
  Lock,
  Play,
  ReceiptText,
  Settings,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { postJson, requestJson } from "./api";
import {
  allTiersConfigured,
  credentialsPayload,
  demoCredentialsPayload,
  effectiveModel,
  emptyCreds,
  sessionActive,
  sessionModels,
  TIERS,
  tierConfigured,
} from "./credentials";
import type { DemoAccessInfo, PresetId, SessionCreds } from "./credentials";
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
  { view: "findings", label: "AI findings", icon: Sparkles },
  { view: "brief", label: "Escalation brief", icon: FileText },
  { view: "history", label: "Run history", icon: History },
  { view: "cost", label: "Cost analytics", icon: BarChart3 },
  { view: "how", label: "How it works", icon: BookOpen },
];

const TITLES: Record<View, [string, string]> = {
  how: ["How it works", "The architecture behind the desk, and how to run your first triage."],
  overview: ["Triage desk", "Resolve routine tickets. Focus human attention where it matters."],
  tickets: ["Ticket inbox", "Every synthetic ticket in the latest batch, searchable and sortable."],
  human: ["Human review", "Low confidence or credits / refunds, never auto-resolved."],
  patterns: ["Evidence & patterns", "Recurring clusters observed in synthetic data, with quoted evidence."],
  findings: ["AI findings", "Model-generated cluster analysis; verify before acting."],
  brief: ["Escalation brief", "Deterministic draft assembled from evidence; review before sending."],
  cost: ["Cost analytics", "Routed cost vs an all-flagship baseline at assumed rates."],
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
  const [demoInfo, setDemoInfo] = useState<DemoAccessInfo | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoDetailsOpen, setDemoDetailsOpen] = useState(false);
  const [demoModels, setDemoModels] = useState({ decision: "", flash: "", max: "" });
  const [demoEngine, setDemoEngine] = useState<"systemone" | "chat">("systemone");
  const [demoProvider, setDemoProvider] = useState<PresetId>("qwen");
  const [consentProvider, setConsentProvider] = useState<PresetId>("qwen");
  const [demoConsentOpen, setDemoConsentOpen] = useState(false);

  useEffect(() => {
    if (!demoConsentOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDemoConsentOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demoConsentOpen]);

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
        const d = await requestJson<DemoAccessInfo>("/api/demo-access").catch(() => null);
        if (alive && d && d.ok) setDemoInfo(d);
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
    if (health.mode === "live") {
      // Both access paths require all three tiers Test-confirmed before a run:
      // bring-your-own needs key+endpoint+model per tier; reviewer demo needs model+Test.
      const problems = demoMode
        ? TIERS.filter((t) => !demoModels[t.id].trim() || tierStatus[t.id].state !== "ok")
        : TIERS.filter((t) => !tierConfigured(creds, t.id) || tierStatus[t.id].state !== "ok");
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
        ...(demoMode
          ? demoCredentialsPayload(demoModels, demoEngine, demoProvider)
          : payload
            ? { credentials: payload }
            : {}),
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
          keySource: r.keySource ?? (demoMode ? "env" : payload ? "session" : "env"),
          decisionEngine: r.decisionEngine ?? (demoMode ? demoEngine : "systemone"),
          models: r.models ?? (demoMode ? demoModels : sessionModels(creds)),
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
  }, [health, batch, creds, tierStatus, demoMode, demoModels, demoEngine, demoProvider]);

  const enableDemo = useCallback(() => {
    const info = consentProvider === "ilmu" ? demoInfo?.ilmu : demoInfo;
    if (!info?.available || !info.models) return;
    setDemoModels(info.models);
    setDemoEngine(info.decisionEngine);
    setDemoProvider(consentProvider);
    setDemoMode(true);
    setDemoConsentOpen(false);
    setTierStatusState({ decision: idleTest(), flash: idleTest(), max: idleTest() });
  }, [demoInfo, consentProvider]);

  const exitDemo = useCallback(() => {
    setDemoMode(false);
    setTierStatusState({ decision: idleTest(), flash: idleTest(), max: idleTest() });
  }, []);

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
        : [...prev, { ticketId: id, line: `${id}: marked for brief review in this session (local mark only; does not change the draft).` }],
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
  const presetLabel = demoProvider === "ilmu" ? "ILMU" : "Qwen";
  const consentInfo = consentProvider === "ilmu" ? demoInfo?.ilmu : demoInfo;

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
    demoInfo,
    demoMode,
    demoModels,
    setDemoModels,
    demoEngine,
    setDemoEngine,
    demoProvider,
    requestDemo: (p) => {
      setConsentProvider(p);
      setDemoConsentOpen(true);
    },
    exitDemo,
    copyBrief,
    copied,
  };

  const counts: Partial<Record<View, number>> = {
    tickets: batch?.tickets.length,
    human: result?.humanQueue.length,
    patterns: result?.patterns.length,
    findings: result?.analyses.length,
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
          ? "bg-signal-wash font-semibold text-signal-deep"
          : n.view === "how"
            ? "font-semibold text-signal-deep hover:bg-paper-2"
            : "text-muted-foreground hover:bg-paper-2 hover:text-foreground"
      }`}
    >
      <n.icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{n.label}</span>
      {counts[n.view] != null && (
        <span
          className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
            n.view === "human"
              ? "bg-paper-3 text-warn"
              : "bg-paper-3 text-ink-3"
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-sidebar lg:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <span className="flex size-9 items-center justify-center rounded-md bg-graphite text-graphite-ink">
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
          <a
            href="https://krackeddevs.com/profile/nazlamp"
            target="_blank"
            rel="noreferrer"
            title="Built by @nazlamp, Kracked Devs profile"
            className="group block rounded-md border border-rule bg-paper-2 px-3 py-2.5 transition-colors hover:border-rule-2"
          >
            <p className="text-[11px] font-medium text-ink-3">
              Built by
            </p>
            <p className="flex items-center gap-1 text-sm font-bold text-ink">
              @nazlamp
              <ArrowUpRight className="size-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
            </p>
            <p className="text-[11px] text-muted-foreground">Kracked Devs, demo workspace</p>
          </a>
          {navButton({ view: "settings", label: "Settings", icon: Settings })}
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-60">
        <header className="sticky top-0 z-30 border-b bg-background">
          <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
            <span className="flex items-center gap-2 lg:hidden">
              <span className="flex size-7 items-center justify-center rounded-md bg-graphite text-graphite-ink">
                <Layers className="size-3.5" />
              </span>
              <span className="text-sm font-bold tracking-tight">COSTERA</span>
            </span>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Workspace / <span className="font-medium text-foreground">{TITLES[view][0]}</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              {health?.mode === "fixture" ? (
                <Badge className="text-warn" title="Simulated classifier responses for local development, not live model calls">
                  Fixture mode
                </Badge>
              ) : demoMode ? (
                <Badge
                  className="cursor-pointer text-signal-deep"
                  title="Owner-provided server-side access for the bounty review window only, retired after review. Click to open Settings."
                  onClick={() => setView("settings")}
                >
                  <Hourglass /> Temporary reviewer access ({presetLabel})
                </Badge>
              ) : byo ? (
                <Badge
                  className="cursor-pointer text-ok"
                  title="Reviewer-supplied session API key: memory only, cleared on refresh, used for this request alone. Click to open Settings."
                  onClick={() => setView("settings")}
                >
                  <CircleCheck /> Session API key
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="cursor-pointer text-ink-2 hover:text-foreground"
                  title="This build has no server-side key. Click to open Settings and add your own API access"
                  onClick={() => setView("settings")}
                >
                  <KeyRound /> Add access in Settings
                </Badge>
              )}
              <Badge variant="outline" title="Synthetic tickets, customers, plans and outages only">
                <ShieldAlert /> Synthetic data
              </Badge>
            </div>
          </div>
          <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Workspace sections">
            {NAV.map((n) => navButton(n, true))}
            {navButton({ view: "settings", label: "Settings", icon: Settings }, true)}
          </nav>
        </header>

        <main className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{TITLES[view][0]}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{TITLES[view][1]}</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap">
              {(view === "overview" || view === "tickets" || view === "history") && (
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" disabled={!result} onClick={() => openLog()} title={result ? "Per-ticket request/response trace of the latest run" : "Run triage first"}>
                  <FileText /> View run log
                </Button>
              )}
              {(view === "overview" || view === "tickets") && (
                <Button
                  onClick={run}
                  disabled={!canRun}
                  size="sm"
                  className="flex-1 sm:flex-none"
                  title={
                    result
                      ? "Triage already completed. Reload the page to run again"
                      : health?.mode === "live"
                        ? "Opens a setup checklist until all three tiers are Test-confirmed"
                        : undefined
                  }
                >
                  {result ? <Check /> : running ? <Loader2 className="animate-spin" /> : <Play />}
                  {result ? "Triage complete" : running ? "Triaging…" : `Run triage (${batch?.tickets.length ?? 0})`}
                </Button>
              )}
            </div>
          </div>

          {view !== "how" && (
            <div
              role="note"
              className="rounded-md border border-rule bg-paper-2 px-4 py-2.5 text-sm text-ink-2"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AlertTriangle className="size-4 shrink-0 text-warn" />
                <p className="min-w-0 flex-1">
                  <span className="font-semibold">Demo environment: synthetic demo data.</span>{" "}
                  <span className="font-semibold">No persistence yet:</span> a page refresh resets the desk.
                </p>
                <button
                  type="button"
                  onClick={() => setDemoDetailsOpen((v) => !v)}
                  aria-expanded={demoDetailsOpen}
                  className="hit-44 -my-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-signal-deep hover:underline active:text-signal"
                >
                  Details
                  <ChevronDown className={`size-3.5 transition-transform ${demoDetailsOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {demoDetailsOpen && (
                <p className="mt-2 border-t pt-2 text-xs leading-relaxed">
                  All tickets, customers, plans and outages are fictional; patterns are observations in synthetic
                  data, not verified network truth. No real customer information. This build has no database, so a
                  page refresh resets the desk; the run, findings, brief, marks and history are gone and your API
                  access must be entered again in Settings.
                </p>
              )}
              {health?.mode === "live" &&
                ((demoMode && TIERS.some((t) => tierStatus[t.id].state !== "ok")) ||
                  (!demoMode && (!byo || !tiersComplete))) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
                    <span className="min-w-0 flex-1">
                      {demoMode
                        ? `Temporary reviewer access (${presetLabel} preset) is active; the owner's key and endpoint stay server-side. This access is retired after the bounty review.`
                        : !byo
                          ? "No API access this session. Add your own key in Settings, or use the temporary reviewer access offered there."
                          : "Session setup is incomplete: every tier needs a key, an HTTPS endpoint and a chosen model before triage can run."}
                    </span>
                    <Button size="sm" onClick={() => setView("settings")}>
                      {demoMode ? (
                        <>
                          <Check /> Test all three tiers
                        </>
                      ) : (
                        <>
                          <KeyRound /> Set API access first
                        </>
                      )}
                    </Button>
                  </div>
                )}
            </div>
          )}

          {health?.mode === "fixture" && (
            <Alert className="border-rule bg-paper-2 text-ink-2 [&>svg]:text-warn">
              <AlertTriangle />
              <AlertTitle>Fixture mode: local development</AlertTitle>
              <AlertDescription>
                Classifier responses are simulated fixtures, not live model calls. The published site calls real
                models using the API access each reviewer enters in Settings.
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

          <footer className="space-y-1 pb-2 pt-4 text-xs text-muted-foreground">
            <p>COSTERA bounty demo. Fictional telco, all data synthetic. Your own API access, never stored.</p>
            <p className="lg:hidden">
              Built by{" "}
              <a
                href="https://krackeddevs.com/profile/nazlamp"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-signal-deep underline decoration-signal/40 underline-offset-2 hover:text-signal"
              >
                @nazlamp
              </a>
              , Kracked Devs
            </p>
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
            className="absolute inset-0 bg-graphite/60"
            onClick={() => setPreflightOpen(false)}
          />
          <div className="scrollbar-thin relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg border border-rule bg-card p-4 shadow-2xl sm:p-5">
            <h2 id="preflight-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <ShieldAlert className="size-4 text-warn" />
              {demoMode ? "Test the 3-tier reviewer access first" : "Finish the 3-tier AI setup first"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {demoMode
                ? "Temporary reviewer access supplies the key and endpoint server-side; they are never shown here. Each tier still needs a chosen model (pre-filled with the verified setup) and a passing Test before triage can run."
                : "Triage needs all three tiers configured (a key, an HTTPS endpoint and a chosen model), each confirmed accessible with Test. Your own access is what gets used; fixture mode (local development) is the only run that skips this step."}
            </p>
            <ul className="mt-3 space-y-2">
              {TIERS.map((t) => {
                const model = demoMode ? demoModels[t.id].trim() : effectiveModel(creds, t.id);
                const configured = demoMode ? model.length > 0 : tierConfigured(creds, t.id);
                const status = tierStatus[t.id];
                const chip = !configured
                  ? [
                      "text-warn",
                      <TriangleAlert className="size-3" />,
                      demoMode ? "Choose a model in Settings" : "Add key, endpoint & model",
                    ]
                  : status.state === "ok"
                    ? ["text-ok", <CircleCheck className="size-3" />, "Ready"]
                    : status.state === "error"
                      ? ["text-error", <CircleX className="size-3" />, "Test failed, check Settings"]
                      : status.state === "testing"
                        ? ["text-ink-3", <Loader2 className="size-3 animate-spin" />, "Testing…"]
                        : ["text-signal-deep", <CircleDashed className="size-3" />, "Press Test to confirm access"];
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-rule px-3 py-2">
                    <span className="text-xs font-semibold text-ink-2">
                      {t.label}
                    </span>
                    {model ? (
                      <ModelName>{model}</ModelName>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">no selection</span>
                    )}
                    <span className={`ml-auto inline-flex items-center gap-1 text-[11px] font-medium ${chip[0]}`}>
                      {chip[1]}
                      {chip[2]}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                size="sm"
                variant="outline"
                className="justify-start sm:mr-auto"
                onClick={() => {
                  setPreflightOpen(false);
                  setView("how");
                }}
              >
                <BookOpen /> How it works
              </Button>
              <div className="flex justify-end gap-2">
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
        </div>
      )}

      {demoConsentOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-consent-title"
        >
          <div
            className="absolute inset-0 bg-graphite/60"
            onClick={() => setDemoConsentOpen(false)}
          />
          <div className="scrollbar-thin relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg border border-rule bg-card p-4 shadow-2xl sm:p-5">
            <h2 id="demo-consent-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Hourglass className="size-4 text-signal-deep" /> Temporary reviewer access:{" "}
              {consentProvider === "ilmu" ? "ILMU" : "Qwen"} preset
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              No API key of your own? The desk can borrow the owner's pre-configured access, held server-side, so you
              can review the full workflow end to end.
            </p>
            {consentInfo?.models && (
              <p className="mt-2 rounded-md border border-rule bg-paper-2 px-3 py-2 font-mono text-[11px]">
                {consentInfo.models.decision} (Tier 1), {consentInfo.models.flash} (Tier 2 light),{" "}
                {consentInfo.models.max} (Tier 2 heavy)
              </p>
            )}
            {consentProvider === "ilmu" && (
              <p className="mt-2 text-xs text-warn">
                The ILMU preset classifies Tier 1 via the chat engine (self-reported confidence) and is not yet
                verified end-to-end; check the run trace before relying on results.
              </p>
            )}
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex gap-2">
                <Hourglass className="mt-0.5 size-4 shrink-0 text-signal-deep" />
                <span>
                  <span className="font-medium">Temporary by design.</span> Available only for the bounty review
                  window; disabled once the submission has been reviewed and approved.
                </span>
              </li>
              <li className="flex gap-2">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <span>
                  <span className="font-medium">After retirement, only your own key works.</span> The owner removes the
                  pre-setup env; bring-your-own access in Settings remains the permanent path.
                </span>
              </li>
              <li className="flex gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <span>
                  <span className="font-medium">Key and endpoint stay hidden.</span> They are never sent to your
                  browser and cannot be viewed or edited while this mode is on.
                </span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                <span>
                  <span className="font-medium">Test before you run.</span> Press Test on all three tiers in Settings;
                  Run triage unlocks only after all three confirm access.
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                <span>
                  <span className="font-medium">Nothing is stored.</span> Refreshing the page or exiting this mode
                  returns the desk to bring-your-own access.
                </span>
              </li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDemoConsentOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={enableDemo}>
                <Hourglass /> Use temporary {consentProvider === "ilmu" ? "ILMU" : "Qwen"} access
              </Button>
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={logRun !== null}
        onClose={() => setLogRun(null)}
        wide
        title={logRun ? `Run log: ${logRun.id.slice(0, 8)}` : "Run log"}
        sub={logRun ? `${new Date(logRun.at).toLocaleString()}, ${logRun.mode}, ${logRun.trace.length} traced calls` : undefined}
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
                  <span className="font-mono text-xs font-semibold">{t.ticketId ?? t.clusterKey ?? "n/a"}</span>
                  {t.lane && <LaneBadge lane={t.lane} />}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {t.latencyMs != null ? `${t.latencyMs} ms` : "n/a"}
                    {t.inputTokens != null ? `, ${t.inputTokens} in` : ""}
                    {t.outputTokens != null ? ` / ${t.outputTokens} out` : ""}
                  </span>
                </div>
                {t.reasons.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{t.reasons.join("; ")}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-signal-deep">
                    Request body
                  </summary>
                  <pre className="scrollbar-thin mt-1 max-h-56 overflow-auto rounded-md bg-graphite p-2.5 font-mono text-[11px] text-graphite-ink">
                    {JSON.stringify(t.request, null, 2)}
                  </pre>
                </details>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs font-medium text-signal-deep">
                    Raw response
                  </summary>
                  <pre className="scrollbar-thin mt-1 max-h-56 overflow-auto rounded-md bg-graphite p-2.5 font-mono text-[11px] text-graphite-ink">
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
        sub={openTicketTr ? `${openTicketTr.intent ?? "unclassified"}, routed ${openTicketTr.lane}` : "Not routed yet"}
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
              <h4 className="text-xs font-semibold text-ink-3">
                Run trace for this ticket
              </h4>
              {ticketTrace.some((t) => t.stage === "tier2_heavy") && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tier 2 heavy runs per cluster, not per ticket; the heavy-lane call below covers this ticket's
                  analysed cluster.
                </p>
              )}
              <div className="mt-2 space-y-2">
                {ticketTrace.map((t, i) => (
                  <div key={i} className="rounded-lg border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StageBadge stage={t.stage} />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {t.latencyMs != null ? `${t.latencyMs} ms` : "n/a"}
                      </span>
                    </div>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs font-medium text-signal-deep">
                        Request / response
                      </summary>
                      <pre className="scrollbar-thin mt-1 max-h-64 overflow-auto rounded-md bg-graphite p-2.5 font-mono text-[11px] text-graphite-ink">
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
              Summary above generated by{" "}
              {result?.models?.flash ? <ModelName>{result.models.flash}</ModelName> : "the light-lane model"}; model
              output, verify before use.
            </InfoNote>
          )}
        </div>
      </Drawer>
    </div>
  );
}