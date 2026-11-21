import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  Clock,
  Copy,
  Check,
  FileText,
  RadioTower,
  ReceiptText,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeCost, ratesForModels } from "../cost";
import { sessionModels } from "../credentials";
import type { Desk } from "../components/bits";
import { InfoNote, Kpi, SectionCard, TicketChip, usd } from "../components/bits";
import { ModelCost } from "../components/ModelCost";
import { TicketDetail, TicketTable } from "../components/TicketTable";

export function Overview({ desk }: { desk: Desk }) {
  const { result, batch } = desk;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cost = result ? computeCost(result.stats, ratesForModels(result.models)) : null;
  const selectedTicket = batch?.tickets.find((t) => t.id === desk.selected);
  const selectedTr = result?.tickets.find((t) => t.id === desk.selected);
  const lanes = result?.stats.lanes ?? {};
  const trace = result?.trace ?? [];
  const stageCount = (s: string) => trace.filter((t) => t.stage === s).length;

  return (
    <div className="space-y-5">
      <div>
        <button
          type="button"
          onClick={() => desk.setView("how")}
          className="hit-44 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-signal-deep hover:underline active:text-signal"
        >
          <BookOpen className="size-3.5" /> How it works
        </button>
      </div>

      {result && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            icon={ClipboardList}
            label="Tickets processed"
            value={String(result.stats.tickets)}
            sub="Latest batch"
          />
          <Kpi
            icon={Users}
            label="Needs human review"
            value={String(result.humanQueue.length)}
            sub="Low confidence or credits / refunds"
          />
          <Kpi
            icon={BarChart3}
            label="Recurring patterns"
            value={String(result.patterns.length)}
            sub="Linked to supporting tickets"
          />
          <Kpi
            icon={ReceiptText}
            label="Estimated cost savings"
            value={cost?.savingsPct != null ? `${cost.savingsPct.toFixed(0)}%` : "n/a"}
            sub="vs. all-flagship baseline, assumed rates"
          />
        </div>
      )}

      {result && (
        <div className="panel flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="mr-2">
            <p className="text-sm font-semibold">Routing summary</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
            <CircleCheck className="size-3.5" /> {lanes.direct ?? 0} Direct / code
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn">
            <TriangleAlert className="size-3.5" /> {lanes.human_review ?? 0} Human review
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-signal-deep">
            <ArrowUpRight className="size-3.5" /> {lanes.tier2_candidate ?? 0} Tier 2 candidates
          </span>
          <span className="flex w-full items-center gap-2 border-t pt-2 text-xs text-muted-foreground sm:ml-auto sm:w-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <Clock className="size-4" />
            <span>
              Avg. latency{" "}
              <span className="font-mono text-sm font-semibold text-foreground">
                {result.stats.avgLatencyMs != null ? `${result.stats.avgLatencyMs} ms` : "n/a"}
              </span>
            </span>
          </span>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title="Ticket worklist" sub="Prioritised for review">
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
        <SectionCard title="Ticket detail" className="xl:sticky xl:top-20">
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
          action={
            <button
              type="button"
              onClick={() => desk.setView("patterns")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-signal-deep hover:underline active:text-signal"
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
                <div key={p.key} className="flex flex-wrap items-center gap-3 rounded-md border border-rule bg-paper-2 px-3.5 py-3">
                  {p.intent === "technical" ? (
                    <RadioTower className="size-4 shrink-0 text-ink-3" />
                  ) : (
                    <ReceiptText className="size-4 shrink-0 text-ink-3" />
                  )}
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.distinctCustomers} customers, {p.count} linked tickets
                    </p>
                  </div>
                  {result!.analyses.some((a) => a.key === p.key) && (
                    <Badge variant="outline" className="text-signal-deep">
                      Supports escalation
                    </Badge>
                  )}
                  <span className="flex gap-1.5">
                    {p.ticketIds.slice(0, 2).map((id) => (
                      <TicketChip key={id} id={id} onClick={() => desk.openTicket(id)} />
                    ))}
                    {p.ticketIds.length > 2 && (
                      <span className="inline-flex min-h-9 items-center rounded-md border border-rule bg-paper-3 px-2 font-mono text-[11px] text-ink-3">
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
          action={
            <Badge variant="outline" className="text-signal-deep">
              <Sparkles className="size-3" /> AI-assisted draft
            </Badge>
          }
        >
          <div className="space-y-3">
            {(result?.patterns ?? []).slice(0, 2).map((p) => (
              <div key={p.key} className="flex items-start gap-2.5">
                {p.intent === "technical" ? (
                  <RadioTower className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                ) : (
                  <ReceiptText className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                )}
                <div>
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.count} tickets, {p.distinctCustomers} customers, min confidence {Math.round(p.confidenceMin * 100)}%
                  </p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
              <div>
                <p className="text-sm font-medium">
                  {result?.humanQueue.length ?? 0} tickets awaiting human decision
                </p>
                <p className="text-xs text-muted-foreground">Low confidence or credits / refunds</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => desk.setView("brief")}>
                <FileText /> Review draft
              </Button>
              <Button size="sm" variant="outline" onClick={desk.copyBrief} disabled={!result}>
                {desk.copied ? <Check /> : <Copy />} {desk.copied ? "Copied" : "Copy brief"}
              </Button>
            </div>
            <InfoNote>Verify all findings before sending.</InfoNote>
          </div>
        </SectionCard>
      </div>

      <section className="panel">
        <div className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              aria-label="Model routing and run details"
              className="hit-44 flex min-h-9 flex-1 items-center gap-3 whitespace-nowrap text-left transition-transform active:translate-y-px"
            >
              <BarChart3 className="size-4 shrink-0 text-ink-3" />
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                Model routing &amp; run details
                <ChevronDown className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            <span className="text-xs text-muted-foreground">All cost figures are estimates</span>
          </div>
          <p className="pl-7 text-xs text-muted-foreground">
            Tier 1 classifier, policy checks, then direct, human or Tier 2
          </p>
        </div>
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
                <span>{stageCount("tier1")} Tier 1 calls,</span>
                <span>{stageCount("tier2_light")} light,</span>
                <span>{stageCount("tier2_heavy")} heavy</span>
                <button type="button" onClick={() => desk.openLog()} className="font-semibold text-signal-deep hover:underline">
                  View run log
                </button>
                <button type="button" onClick={() => desk.setView("cost")} className="font-semibold text-signal-deep hover:underline">
                  Cost analytics
                </button>
                <span className="ml-auto">
                  <span className="font-mono">{usd(cost?.routed ?? 0)}</span> routed est.
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}