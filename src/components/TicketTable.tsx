import { useMemo, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, ExternalLink, FileText, Plus, Check, Search, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Batch, Ticket, TicketResult, TriageResult } from "../types";
import { ConfidenceBar, InfoNote, LaneBadge, ModelName, TicketChip } from "./bits";

export interface Row {
  ticket: Ticket;
  tr: TicketResult | undefined;
}

const LANE_RANK: Record<string, number> = { human_review: 0, tier2_candidate: 1, error: 2, direct: 3 };

export function issueTitle(text: string) {
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

export function TicketTable({
  batch,
  result,
  selected,
  onSelect,
  onOpen,
  pageSize = 6,
  priority = false,
}: {
  batch: Batch | null;
  result: TriageResult | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  pageSize?: number;
  priority?: boolean;
}) {
  const [q, setQ] = useState("");
  const [lane, setLane] = useState("all");
  const [sort, setSort] = useState(priority ? "priority" : "id");
  const [page, setPage] = useState(0);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map((result?.tickets ?? []).map((t) => [t.id, t]));
    let list: Row[] = (batch?.tickets ?? []).map((ticket) => ({ ticket, tr: byId.get(ticket.id) }));
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          r.ticket.id.toLowerCase().includes(needle) ||
          r.ticket.text.toLowerCase().includes(needle) ||
          r.ticket.customer.toLowerCase().includes(needle) ||
          (r.tr?.intent ?? "").toLowerCase().includes(needle),
      );
    }
    if (lane !== "all") list = list.filter((r) => (r.tr ? r.tr.lane === lane : lane === "unrouted"));
    list = [...list].sort((a, b) => {
      if (sort === "confidence") {
        const av = a.tr?.confidence ?? -1;
        const bv = b.tr?.confidence ?? -1;
        return av - bv;
      }
      if (sort === "priority") {
        const ar = a.tr ? LANE_RANK[a.tr.lane] : 4;
        const br = b.tr ? LANE_RANK[b.tr.lane] : 4;
        if (ar !== br) return ar - br;
        const ac = a.tr?.confidence ?? 1;
        const bc = b.tr?.confidence ?? 1;
        if (ac !== bc) return ac - bc;
      }
      return a.ticket.id.localeCompare(b.ticket.id);
    });
    return list;
  }, [batch, result, q, lane, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search tickets…"
            className="w-full rounded-lg border bg-background py-1.5 pl-8 pr-2.5 text-xs outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25"
          />
        </label>
        <select
          value={lane}
          onChange={(e) => {
            setLane(e.target.value);
            setPage(0);
          }}
          aria-label="Filter by lane"
          className="rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-teal-500"
        >
          <option value="all">All lanes</option>
          <option value="direct">Direct / code</option>
          <option value="human_review">Human review</option>
          <option value="tier2_candidate">Tier 2 candidate</option>
          <option value="error">Error</option>
          {!result && <option value="unrouted">Not routed yet</option>}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort tickets"
          className="rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-teal-500"
        >
          <option value="priority">Sort: review priority</option>
          <option value="id">Sort: ticket ID</option>
          <option value="confidence">Sort: confidence ↑</option>
        </select>
      </div>

      <div className="scrollbar-thin mt-3 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-130 text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Ticket / issue</th>
              <th className="px-3 py-2 font-medium">Intent</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Route</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const active = r.ticket.id === selected;
              return (
                <tr
                  key={r.ticket.id}
                  onClick={() => onSelect(r.ticket.id)}
                  className={`cursor-pointer border-b last:border-0 transition-colors ${
                    active
                      ? "bg-teal-50/80 shadow-[inset_3px_0_0_0_var(--primary)] dark:bg-teal-950/40"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-mono text-xs font-semibold">{r.ticket.id}</p>
                    <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{issueTitle(r.ticket.text)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{r.tr?.intent ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <ConfidenceBar value={r.tr?.confidence ?? null} probabilities={r.tr?.probabilities} />
                  </td>
                  <td className="px-3 py-2.5">{r.tr ? <LaneBadge lane={r.tr.lane} /> : <span className="text-xs text-muted-foreground">Not routed</span>}</td>
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      aria-label={`Open ${r.ticket.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r.ticket.id);
                      }}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No tickets match the current search or filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Showing {rows.length === 0 ? 0 : safePage * pageSize + 1}–{Math.min(rows.length, (safePage + 1) * pageSize)} of{" "}
          {rows.length} tickets
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="rounded-md border p-1.5 transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              className={`size-7 rounded-md border font-mono text-xs transition-colors ${
                i === safePage ? "border-teal-600 bg-teal-600 text-white" : "hover:bg-muted"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            aria-label="Next page"
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
            className="rounded-md border p-1.5 transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-3">
        <InfoNote>Credits and refunds always require human approval, regardless of confidence.</InfoNote>
      </div>
    </div>
  );
}

export function TicketDetail({
  ticket,
  tr,
  result,
  onOpen,
  onAdd,
  added,
  onViewFindings,
}: {
  ticket: Ticket | undefined;
  tr: TicketResult | undefined;
  result: TriageResult | null;
  onOpen: (id: string) => void;
  onAdd: (id: string) => void;
  added: boolean;
  onViewFindings?: () => void;
}) {
  if (!ticket) {
    return (
      <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
        Select a ticket in the worklist to see its message, routing rationale and evidence.
      </p>
    );
  }
  const analysis = result?.analyses.find((a) => a.ticketIds.includes(ticket.id));
  const nextStep =
    tr?.lookup?.detail ??
    (tr?.lane === "human_review"
      ? "Verify the account and billing period with the customer before responding."
      : tr?.lane === "tier2_candidate"
        ? "Escalated: flash summary prepared; Max cluster analysis runs only if the cluster warrants it."
        : tr?.lane === "direct"
          ? "Answer from the deterministic knowledge-base hit below; no generation call needed."
          : "Run triage to classify and route this ticket.");
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-sm font-semibold">{ticket.id}</p>
          <span className="flex flex-wrap items-center gap-1.5">
            {analysis && (
              <span className="inline-flex rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-[11px] font-medium text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300">
                Max analysed
              </span>
            )}
            {tr ? <LaneBadge lane={tr.lane} /> : <span className="text-xs text-muted-foreground">Not routed yet</span>}
          </span>
        </div>
        <h3 className="mt-1.5 text-base font-semibold tracking-tight">{issueTitle(ticket.text)}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {tr?.intent ?? "Unclassified"} · Synthetic customer {ticket.customer} · {ticket.channel}
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer message</h4>
        <blockquote className="mt-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm italic">
          <Quote className="mb-1 size-3.5 text-muted-foreground" />
          {ticket.text}
        </blockquote>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {tr?.lane === "human_review" ? "Why this needs review" : "Routing rationale"}
        </h4>
        <p className="mt-1.5 flex items-start gap-2 text-sm">
          <span
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              tr?.lane === "human_review" || tr?.unsure
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                : "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300"
            }`}
          >
            !
          </span>
          <span>
            {tr
              ? tr.reasons.length > 0
                ? tr.reasons.join("; ")
                : tr.unsure
                  ? `Classifier confidence ${Math.round((tr.confidence ?? 0) * 100)}% — below the 70% threshold.`
                  : `Classified ${tr.intent} at ${Math.round((tr.confidence ?? 0) * 100)}% confidence; routed by policy.`
              : "Not routed yet — run triage to classify and route this ticket."}
          </span>
        </p>
        {tr?.summary && (
          <p className="mt-1.5 text-xs italic text-muted-foreground">
            Summary (<ModelName>qwen3.8-flash</ModelName>): {tr.summary}
          </p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended next step</h4>
        <p className="mt-1.5 flex items-start gap-2 text-sm">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{analysis?.nextStep ?? nextStep}</span>
        </p>
      </div>

      {analysis && (
        <div className="rounded-lg border border-fuchsia-200/80 bg-fuchsia-50/50 px-3.5 py-3 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/25">
          <h4 className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">
            <Brain className="size-3.5" />
            Tier 2 heavy · cluster analysis
            <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-medium normal-case text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-300">
              model-generated
            </span>
          </h4>
          <p className="mt-1.5 text-sm font-medium">{analysis.title}</p>
          <p className="mt-1 text-sm">{analysis.summary}</p>
          {analysis.likelyCause && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Likely cause:</span> {analysis.likelyCause}
            </p>
          )}
          {analysis.caveats && <p className="mt-1 text-xs italic text-muted-foreground">{analysis.caveats}</p>}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Generated by <ModelName>{analysis.model}</ModelName> for this ticket's cluster ({analysis.count} tickets) —
            verify before acting.
          </p>
          {onViewFindings && (
            <button
              type="button"
              onClick={onViewFindings}
              className="mt-2 text-xs font-semibold text-fuchsia-700 hover:underline dark:text-fuchsia-300"
            >
              View full finding →
            </button>
          )}
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</h4>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <TicketChip id={`Ticket ${ticket.id}`} onClick={() => onOpen(ticket.id)} />
          {tr?.lookup && <TicketChip id={tr.lookup.label} onClick={() => onOpen(ticket.id)} />}
          {tr?.quotes.slice(0, 2).map((qline, i) => (
            <span key={i} className="max-w-52 truncate rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] italic">
              “{qline}”
            </span>
          ))}
        </div>
        {tr?.lookup && <p className="mt-1.5 text-xs text-muted-foreground">{tr.lookup.detail}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onOpen(ticket.id)}>
          <ExternalLink /> Open ticket
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={added}
          onClick={() => onAdd(ticket.id)}
          title="Local review mark only — never changes the draft, is not copied, and is never sent"
        >
          {added ? <Check /> : <Plus />} {added ? "Marked for brief" : "Add to brief"}
        </Button>
      </div>
    </div>
  );
}