import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  Check,
  FileText,
  RadioTower,
  ReceiptText,
  Sparkles,
  Users,
} from "lucide-react";
import architectureUrl from "@/docs/architecture.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeCost, ratesForModels } from "../cost";
import { sessionModels } from "../credentials";
import type { Desk } from "../components/bits";
import { InfoNote, Kpi, SectionCard, TicketChip, usd } from "../components/bits";
import { ModelCost } from "../components/ModelCost";
import { TicketDetail, TicketTable } from "../components/TicketTable";

const TABS: { view: Desk["view"]; label: (d: Desk) => string }[] = [
  { view: "overview", label: () => "Overview" },
  { view: "tickets", label: (d) => `All tickets (${d.batch?.tickets.length ?? 0})` },
  { view: "patterns", label: (d) => `Patterns (${d.result?.patterns.length ?? 0})` },
  { view: "findings", label: (d) => `AI findings (${d.result?.analyses.length ?? 0})` },
  { view: "brief", label: () => "Escalation brief" },
];

export function Overview({ desk }: { desk: Desk }) {
  const { result, batch } = desk;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const cost = result ? computeCost(result.stats, ratesForModels(result.models)) : null;
  const selectedTicket = batch?.tickets.find((t) => t.id === desk.selected);
  const selectedTr = result?.tickets.find((t) => t.id === desk.selected);
  const lanes = result?.stats.lanes ?? {};
  const trace = result?.trace ?? [];
  const stageCount = (s: string) => trace.filter((t) => t.stage === s).length;

  return (
    <div className="space-y-5">
      <section className="rise rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
          className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            <BookOpen className="size-4" />
          </span>
          <span className="min-w-52 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              How it works
              <ChevronDown className={`size-4 transition-transform ${howOpen ? "rotate-180" : ""}`} />
            </span>
            <span className="text-xs text-muted-foreground">
              Every ticket takes the cheapest lane that can answer it · unsure or money-touching stops at a human
            </span>
          </span>
          <span className="text-xs text-muted-foreground">Synthetic data · estimated costs</span>
        </button>
        {howOpen && (
          <div className="space-y-3 border-t px-5 py-4">
            <p className="text-sm leading-relaxed">
              Tier 1 reads intent and complexity for every ticket. A policy then sends each one to a free
              knowledge-base lookup, a human queue, or Tier 2 — the light lane for summaries, the heavy lane only for
              clusters that
              genuinely need cross-ticket reading. What you get back is evidence rather than opinion: ticket IDs,
              quoted lines, counts and confidence, plus a draft escalation brief and an estimate of what the routing
              saved.
            </p>
            <a
              href={architectureUrl}
              target="_blank"
              rel="noreferrer"
              title="Open full size in a new tab"
              className="block overflow-hidden rounded-lg border bg-white p-2 transition-shadow hover:shadow-md"
            >
              <img
                src={architectureUrl}
                alt="COSTERA solution architecture: triage desk → orchestrator → cost-aware routing policy → direct code lane, human review or Tier 2 escalation → evidence-labelled output, with knowledge base, observability and cost analytics alongside."
                className="mx-auto w-full max-w-3xl"
                loading="lazy"
                decoding="async"
              />
            </a>
            <Button size="sm" variant="outline" onClick={() => desk.setView("how")}>
              <BookOpen /> Full explanation and reviewer path
            </Button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          icon={ClipboardList}
          tone="blue"
          label="Tickets processed"
          value={String(result?.stats.tickets ?? batch?.tickets.length ?? 0)}
          sub={result ? "Latest batch" : "Awaiting first run"}
        />
        <Kpi
          icon={Users}
          tone="amber"
          delay={60}
          label="Needs human review"
          value={result ? String(result.humanQueue.length) : "—"}
          sub="Low confidence or credits / refunds"
        />
        <Kpi
          icon={BarChart3}
          tone="violet"
          delay={120}
          label="Recurring patterns"
          value={result ? String(result.patterns.length) : "—"}
          sub="Linked to supporting tickets"
        />
        <Kpi
          icon={ReceiptText}
          tone="teal"
          delay={180}
          label="Estimated cost savings"
          value={cost?.savingsPct != null ? `${cost.savingsPct.toFixed(0)}%` : "—"}
          sub="vs. all-flagship baseline · assumed rates"
        />
      </div>

      <div className="rise flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-3 shadow-xs" style={{ animationDelay: "220ms" }}>
        <div className="mr-2">
          <p className="text-sm font-semibold">Routing summary</p>
          <p className="text-xs text-muted-foreground">How tickets were routed in latest run</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
          <span className="size-1.5 rounded-full bg-teal-500" /> {lanes.direct ?? 0} Direct / code
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" /> {lanes.human_review ?? 0} Human review
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          <span className="size-1.5 rounded-full bg-violet-500" /> {lanes.tier2_candidate ?? 0} Tier 2 candidates
        </span>
        <span className="flex w-full items-center gap-2 border-t pt-2 text-xs text-muted-foreground sm:ml-auto sm:w-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <Clock className="size-4" />
          <span>
            Avg. latency{" "}
            <span className="font-mono text-sm font-semibold text-foreground">
              {result?.stats.avgLatencyMs != null ? `${result.stats.avgLatencyMs} ms` : "—"}
            </span>
          </span>
        </span>
      </div>

      <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-b" aria-label="Overview sections">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            onClick={() => desk.setView(t.view)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm transition-colors ${
              t.view === "overview"
                ? "border-teal-600 font-semibold text-teal-700 dark:text-teal-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label(desk)}
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title="Ticket worklist" sub="Prioritised for review" delay={80}>
          <TicketTable
            batch={batch}
            result={result}
            selected={desk.selected}
            onSelect={desk.setSelected}
            onOpen={desk.openTicket}
            pageSize={6}
            priority
          />
        </SectionCard>
        <SectionCard title="Ticket detail" sub="Message, rationale and evidence" delay={140} className="xl:sticky xl:top-20">
          <TicketDetail
            ticket={selectedTicket}
            tr={selectedTr}
            result={result}
            onOpen={desk.openTicket}
            onAdd={desk.addBrief}
            added={desk.extras.some((e) => e.ticketId === desk.selected)}
            onViewFindings={() => desk.setView("findings")}
          />
        </SectionCard>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard
          title={
            <>
              Recurring patterns <Badge variant="secondary">{result?.patterns.length ?? 0}</Badge>
            </>
          }
          sub="Common issues detected across multiple tickets"
          delay={100}
          action={
            <button
              type="button"
              onClick={() => desk.setView("patterns")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
            >
              View all <ArrowRight className="size-3.5" />
            </button>
          }
        >
          {(result?.patterns.length ?? 0) === 0 ? (
            <InfoNote>No cluster reached the 3-ticket threshold yet. Run triage to detect patterns.</InfoNote>
          ) : (
            <div className="space-y-3">
              {result!.patterns.slice(0, 2).map((p) => (
                <div key={p.key} className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                    {p.intent === "technical" ? <RadioTower className="size-4" /> : <ReceiptText className="size-4" />}
                  </span>
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.distinctCustomers} customers · {p.count} linked tickets
                    </p>
                  </div>
                  {result!.analyses.some((a) => a.key === p.key) && (
                    <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      Supports escalation
                    </Badge>
                  )}
                  <span className="flex gap-1.5">
                    {p.ticketIds.slice(0, 2).map((id) => (
                      <TicketChip key={id} id={id} onClick={() => desk.openTicket(id)} />
                    ))}
                    {p.ticketIds.length > 2 && (
                      <span className="rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-[11px]">
                        +{p.ticketIds.length - 2}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Escalation brief"
          sub="Evidence-linked summary for human review"
          delay={160}
          action={
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <Sparkles className="size-3" /> AI-assisted draft
            </Badge>
          }
        >
          <div className="space-y-3">
            {(result?.patterns ?? []).slice(0, 2).map((p) => (
              <div key={p.key} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300">
                  {p.intent === "technical" ? <RadioTower className="size-3.5" /> : <ReceiptText className="size-3.5" />}
                </span>
                <div>
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.count} tickets · {p.distinctCustomers} customers · min confidence {Math.round(p.confidenceMin * 100)}%
                  </p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
                <Users className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {result?.humanQueue.length ?? 0} tickets awaiting human decision
                </p>
                <p className="text-xs text-muted-foreground">Low confidence or credits / refunds</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="bg-violet-600 text-white hover:bg-violet-500"
                onClick={() => desk.setView("brief")}
              >
                <FileText /> Review draft
              </Button>
              <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300" onClick={desk.copyBrief} disabled={!result}>
                {desk.copied ? <Check /> : <Copy />} {desk.copied ? "Copied" : "Copy brief"}
              </Button>
            </div>
            <InfoNote>Verify all findings before sending.</InfoNote>
          </div>
        </SectionCard>
      </div>

      <section className="rise rounded-xl border bg-card shadow-xs" style={{ animationDelay: "200ms" }}>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <BarChart3 className="size-4" />
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              Model routing &amp; run details
              <ChevronDown className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
            </span>
            <span className="text-xs text-muted-foreground">
              Tier 1 classifier → policy checks → direct, human or Tier 2
            </span>
          </span>
          <span className="text-xs text-muted-foreground">All cost figures are estimates</span>
        </button>
        {detailsOpen && (
          <div className="space-y-4 border-t px-5 py-4">
            <ModelCost
              stats={result?.stats ?? null}
              models={result?.models}
              session={desk.demoMode ? desk.demoModels : sessionModels(desk.creds)}
            />
            {result && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Run trace:</span>
                <span>{stageCount("tier1")} Tier 1 calls</span>·<span>{stageCount("tier2_light")} light</span>·
                <span>{stageCount("tier2_heavy")} heavy</span>
                <button type="button" onClick={() => desk.openLog()} className="font-semibold text-teal-700 hover:underline dark:text-teal-300">
                  View run log
                </button>
                <button type="button" onClick={() => desk.setView("cost")} className="font-semibold text-teal-700 hover:underline dark:text-teal-300">
                  Cost analytics
                </button>
                <span className="ml-auto font-mono">{usd(cost?.routed ?? 0)} routed est.</span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}