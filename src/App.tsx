import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Play, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { postJson, requestJson } from "./api";
import type { Batch, Health, Pattern, TicketResult, TriageResult } from "./types";

function ModeBadge({ health }: { health: Health | null }) {
  if (!health) return <Badge variant="outline">Connecting…</Badge>;
  if (health.mode === "fixture") {
    return <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Fixture mode</Badge>;
  }
  if (health.configured) {
    return <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Live</Badge>;
  }
  return <Badge variant="secondary">Not configured</Badge>;
}

function LaneBadge({ lane }: { lane: TicketResult["lane"] }) {
  if (lane === "direct") return <Badge variant="secondary">Direct lane</Badge>;
  if (lane === "human_review") return <Badge variant="destructive">Human review</Badge>;
  if (lane === "tier2_candidate") return <Badge variant="outline">Tier 2 candidate</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const tone = value < 0.7 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <span className="inline-flex items-center gap-2">
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
          avg confidence {Math.round(pattern.confidenceAvg * 100)}% · intent: {pattern.intent}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold">{value}</p>
    </div>
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

  const canRun = Boolean(health && batch && (health.mode === "fixture" || health.configured)) && !running;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Triage Desk</h1>
            <p className="text-xs text-muted-foreground">ZephyrTel (fictional) · support-agent triage</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeBadge health={health} />
            <Badge variant="outline">Synthetic data</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-6 py-6">
        <Alert>
          <AlertTriangle />
          <AlertTitle>Synthetic demo data</AlertTitle>
          <AlertDescription>
            All tickets, customers, plans and outages are fictional. Patterns are observations in synthetic data — not
            verified network truth.
          </AlertDescription>
        </Alert>

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
                <Button onClick={run} disabled={!canRun} size="sm">
                  {running ? <Loader2 className="animate-spin" /> : <Play />}
                  {running ? "Triaging…" : "Run triage"}
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
                    <p className="mt-1 line-clamp-2 text-sm">{t.text}</p>
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
                  Classifying {batch?.tickets.length ?? 0} tickets with Tier 1, then routing to the cheapest lane…
                </CardContent>
              </Card>
            )}

            {!result && !running && !error && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">No triage run yet</CardTitle>
                  <CardDescription>One loop, start to finish:</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    <li>Load the synthetic ticket batch (already in the inbox).</li>
                    <li>Tier 1 classifies intent and confidence; routine work goes to the deterministic direct lane.</li>
                    <li>
                      You get recurring patterns with evidence — ticket IDs, quoted lines, counts, confidence — plus a
                      draft escalation brief. Unsure or refund-related tickets are flagged for a human.
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {result && !running && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Tickets" value={String(result.stats.tickets)} />
                  <Stat label="Tier 1 calls" value={String(result.stats.tier1Calls)} />
                  <Stat label="Input tokens" value={String(result.stats.inputTokens)} />
                  <Stat
                    label="Avg Tier 1 latency"
                    value={result.stats.avgLatencyMs !== null ? `${result.stats.avgLatencyMs} ms` : "—"}
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
                      Lane counts: {Object.entries(result.stats.lanes).map(([k, v]) => `${k} ${v}`).join(" · ")}
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
                            <TableCell><Confidence value={t.confidence} /></TableCell>
                            <TableCell><LaneBadge lane={t.lane} /></TableCell>
                            <TableCell className="max-w-56 whitespace-normal text-xs text-muted-foreground">
                              {t.unsure && (
                                <Badge className="mb-1 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                  Tier 1 unsure
                                </Badge>
                              )}
                              {t.reasons.join(" ")}
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
                    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed scrollbar-thin">
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