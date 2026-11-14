// Triage orchestration: Tier 1 classify -> route to the cheapest lane -> evidence.
// M1 lanes: direct/code (deterministic lookup, no generation) and human-review flags.
// M2 lanes: Tier 2 light (flash summaries for the escalation set) and Tier 2 heavy
// (max cross-ticket analysis, only for warranted clusters: high-volume or ambiguous).
// Escalation is driven by Tier 1 confidence/probabilities, never by a fixed intent rule.

import { ACCOUNTS, BATCH_LABEL, OUTAGES, PLANS, PROCEDURES, TELCO, TICKETS } from "./data.ts";
import type { Ticket } from "./data.ts";
import { DecisionError } from "./decision.ts";
import type { ClassifyFn, Decision } from "./decision.ts";
import { MAX_MODEL } from "./tier2.ts";
import type { AnalyzeFn, ClusterInput, SummarizeFn } from "./tier2.ts";

export const CONFIDENCE_FLOOR = 0.7;
const REFUND_RE = /\b(refund|credit|chargeback|reimburse)\b/i;
const MAX_ANALYSES_PER_RUN = 4;

export interface LookupHit {
  kind: "outage" | "plan" | "account" | "procedure";
  entity: string;
  label: string;
  detail: string;
}

export interface TicketResult {
  id: string;
  customer: string;
  channel: string;
  createdAt: string;
  text: string;
  intent: string | null;
  complexity: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  lane: "direct" | "human_review" | "tier2_candidate" | "error";
  unsure: boolean;
  reasons: string[];
  lookup: LookupHit | null;
  quotes: string[];
  summary: string | null;
  inputTokens: number | null;
  latencyMs: number | null;
}

export interface Pattern {
  key: string;
  title: string;
  intent: string;
  entity: string | null;
  ticketIds: string[];
  count: number;
  distinctCustomers: number;
  evidence: { ticketId: string; line: string }[];
  confidenceMin: number;
  confidenceAvg: number;
  note: string;
}

export interface TraceEntry {
  stage: "tier1" | "tier2_light" | "tier2_heavy";
  ticketId: string | null;
  clusterKey: string | null;
  at: string;
  request: unknown;
  response: unknown;
  intent: string | null;
  confidence: number | null;
  lane: TicketResult["lane"] | null;
  unsure: boolean;
  reasons: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
}

export interface ClusterAnalysis {
  key: string;
  title: string;
  ticketIds: string[];
  count: number;
  summary: string;
  likelyCause: string | null;
  nextStep: string | null;
  caveats: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  note: string;
}

export interface Tier2Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number | null;
}

export interface TriageStats {
  tickets: number;
  tier1Calls: number;
  inputTokens: number;
  avgLatencyMs: number | null;
  lanes: Record<string, number>;
  patterns: number;
  errors: number;
  tier2: { light: Tier2Usage; heavy: Tier2Usage };
}

export interface TriageResult {
  ok: true;
  mode: "live" | "fixture";
  telco: string;
  synthetic: true;
  batchLabel: string;
  generatedAt: string;
  tickets: TicketResult[];
  patterns: Pattern[];
  analyses: ClusterAnalysis[];
  humanQueue: { id: string; reasons: string[]; summary: string | null }[];
  brief: string;
  stats: TriageStats;
  trace: TraceEntry[];
}

export interface Tier2Deps {
  summarize: SummarizeFn;
  analyze: AnalyzeFn;
}

export function directLookup(ticket: Ticket): LookupHit | null {
  const text = ticket.text.toLowerCase();
  for (const o of OUTAGES) {
    if (text.includes(o.area.toLowerCase())) {
      const when = o.status === "resolved" ? `resolved ${o.resolved}` : `active since ${o.started}`;
      return {
        kind: "outage",
        entity: o.id,
        label: `Known outage ${o.id} — ${o.area}`,
        detail: `${o.service}, ${when}. ${o.note}`,
      };
    }
  }
  for (const p of PLANS) {
    if (text.includes(p.name.toLowerCase())) {
      return {
        kind: "plan",
        entity: p.name,
        label: `Plan reference: ${p.name}`,
        detail: `${p.kind === "add-on" ? "Add-on" : "Plan"} $${p.price}/mo${p.data ? `, ${p.data}` : ""}. ${p.notes}`,
      };
    }
  }
  const handle = ticket.text.match(/cust_\d{3}/)?.[0];
  if (handle) {
    const a = ACCOUNTS.find((x) => x.handle === handle);
    if (a) {
      return {
        kind: "account",
        entity: a.handle,
        label: `Account ${a.handle}`,
        detail: `Plan ${a.plan}, balance $${a.balance.toFixed(2)}, status ${a.status}, next bill due ${a.dueDate}.`,
      };
    }
  }
  if (/\bsim\b/.test(text)) {
    return { kind: "procedure", entity: "sim_swap", label: "SIM replacement procedure", detail: PROCEDURES.sim_swap };
  }
  if (/roam|travel/.test(text)) {
    return { kind: "procedure", entity: "roaming", label: "Roaming activation", detail: PROCEDURES.roaming };
  }
  return null;
}

export function extractQuotes(ticket: Ticket, entity: string | null): string[] {
  const sentences = ticket.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const ranked = entity
    ? sentences.filter((s) => s.toLowerCase().includes(entity.toLowerCase()))
    : [];
  const picked = (ranked.length > 0 ? ranked : sentences).slice(0, 2);
  return picked;
}

function patternTitle(intent: string, hit: LookupHit | null): string {
  if (hit?.kind === "outage") {
    const o = OUTAGES.find((x) => x.id === hit.entity);
    return `Service complaints matching known outage ${hit.entity}${o ? ` (${o.area})` : ""}`;
  }
  if (hit?.kind === "plan" && intent === "billing") {
    return `Billing complaints referencing ${hit.entity}`;
  }
  if (hit) return `${intent} complaints referencing ${hit.entity}`;
  return `${intent} complaints (no single entity)`;
}

function nextStepFor(p: Pattern): string {
  if (p.entity && p.entity.startsWith("OUT-")) {
    return `Confirm ${p.entity} restoration timeline with the network team; proactively update affected customers.`;
  }
  if (p.intent === "billing" && p.entity) {
    return `Ask billing ops to verify proration/adjustment rules for the ${p.entity} change cohort.`;
  }
  return `Route the ${p.intent} cluster to the owning team with the evidence below.`;
}

// Warrant rule for Tier 2 heavy: high-volume clusters, or smaller clusters that
// contain unsure / candidate tickets (ambiguity). Confident small clusters stay cheap.
function warranted(list: TicketResult[]): boolean {
  if (list.length >= 4) return true;
  return list.length >= 2 && list.some((r) => r.unsure || r.lane === "tier2_candidate");
}

function buildBrief(result: Omit<TriageResult, "brief">): string {
  const lines: string[] = [];
  lines.push(`ESCALATION DRAFT — ${TELCO} (fictional telco) — ALL DATA SYNTHETIC`);
  lines.push(`Batch: ${result.batchLabel} · ${result.stats.tickets} tickets · generated ${result.generatedAt}`);
  lines.push("Routing: Tier 1 classifier decision-model-preview → direct lane / human review / Tier 2 (qwen3.8-flash, qwen3.8-max)");
  lines.push("");
  if (result.patterns.length === 0) {
    lines.push("No recurring pattern reached the 3-ticket threshold in this batch.");
  } else {
    lines.push("PATTERNS OBSERVED IN SYNTHETIC TICKETS (not verified network truth):");
    result.patterns.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${p.title} — ${p.count} tickets, ${p.distinctCustomers} customers, confidence min ${(p.confidenceMin * 100).toFixed(0)}% / avg ${(p.confidenceAvg * 100).toFixed(0)}%.`,
      );
      lines.push(`   Tickets: ${p.ticketIds.join(", ")}`);
      if (p.evidence[0]) lines.push(`   Evidence ${p.evidence[0].ticketId}: "${p.evidence[0].line}"`);
      lines.push(`   Next step: ${nextStepFor(p)}`);
    });
  }
  if (result.analyses.length > 0) {
    lines.push("");
    lines.push(`TIER 2 FINDINGS (model-generated by ${MAX_MODEL} — verify before sending):`);
    for (const a of result.analyses) {
      lines.push(`- ${a.title} [${a.ticketIds.join(", ")}]`);
      lines.push(`  Summary: ${a.summary}`);
      if (a.likelyCause) lines.push(`  Likely cause: ${a.likelyCause}`);
      if (a.nextStep) lines.push(`  Next step: ${a.nextStep}`);
      if (a.caveats) lines.push(`  Caveats: ${a.caveats}`);
    }
  }
  lines.push("");
  if (result.humanQueue.length > 0) {
    lines.push("HUMAN REVIEW QUEUE (do not auto-resolve):");
    for (const h of result.humanQueue) {
      lines.push(`- ${h.id}: ${h.reasons.join("; ")}${h.summary ? ` | Summary (qwen3.8-flash): ${h.summary}` : ""}`);
    }
  } else {
    lines.push("HUMAN REVIEW QUEUE: empty.");
  }
  lines.push("");
  lines.push("Deterministic sections assembled from ticket evidence; Tier 2 sections are model-generated and labelled.");
  lines.push("Agent review required before sending. Patterns are observations in synthetic data, not verified network truth.");
  return lines.join("\n");
}

export async function runTriage(
  classify: ClassifyFn,
  ticketIds: string[] | undefined,
  mode: "live" | "fixture",
  tier2?: Tier2Deps,
): Promise<TriageResult> {
  const batch = ticketIds ? TICKETS.filter((t) => ticketIds.includes(t.id)) : TICKETS;
  const ticketById = new Map(TICKETS.map((t) => [t.id, t]));
  const results: TicketResult[] = [];
  const trace: TraceEntry[] = [];

  for (const ticket of batch) {
    const base: TicketResult = {
      id: ticket.id,
      customer: ticket.customer,
      channel: ticket.channel,
      createdAt: ticket.createdAt,
      text: ticket.text,
      intent: null,
      complexity: null,
      confidence: null,
      probabilities: null,
      lane: "error",
      unsure: false,
      reasons: [],
      lookup: null,
      quotes: [],
      summary: null,
      inputTokens: null,
      latencyMs: null,
    };
    let decision: Decision | null = null;
    let failure: unknown = null;
    try {
      decision = await classify(ticket);
      const intentField = decision.fields.intent;
      if (!intentField) {
        base.reasons.push("Classifier returned no intent field.");
      } else {
        base.intent = intentField.choice;
        base.confidence = intentField.confidence;
        base.probabilities = intentField.probabilities;
        base.complexity = decision.fields.complexity?.choice ?? null;
        base.inputTokens = decision.inputTokens;
        base.latencyMs = decision.latencyMs;

        const lookup = directLookup(ticket);
        base.lookup = lookup;
        base.quotes = extractQuotes(ticket, lookup?.entity ?? null);

        const touchesMoney = REFUND_RE.test(ticket.text);
        if (touchesMoney) {
          base.lane = "human_review";
          base.reasons.push("Touches credits/refunds — policy requires a human.");
        } else if (intentField.confidence < CONFIDENCE_FLOOR) {
          base.lane = "human_review";
          base.unsure = true;
          base.reasons.push(`Tier 1 unsure (confidence ${(intentField.confidence * 100).toFixed(0)}% < ${CONFIDENCE_FLOOR * 100}%).`);
        } else if (base.complexity === "complex" && !lookup) {
          base.lane = "tier2_candidate";
          base.reasons.push("Complex and no deterministic answer — Tier 2 candidate (M2).");
        } else {
          base.lane = "direct";
          if (!lookup) base.reasons.push("No KB match — evidence quotes only.");
        }
      }
    } catch (e) {
      failure = e;
      base.reasons.push("Classification failed for this ticket.");
    } finally {
      results.push(base);
      trace.push({
        stage: "tier1",
        ticketId: ticket.id,
        clusterKey: null,
        at: new Date().toISOString(),
        request: decision ? decision.request : failure instanceof DecisionError ? failure.request : null,
        response: decision ? decision.raw : null,
        intent: base.intent,
        confidence: base.confidence,
        lane: base.lane,
        unsure: base.unsure,
        reasons: base.reasons,
        inputTokens: base.inputTokens,
        outputTokens: null,
        latencyMs: base.latencyMs,
      });
    }
  }

  // M2: Tier 2 light summaries for the escalation set (candidates + human review).
  const analyses: ClusterAnalysis[] = [];
  if (tier2) {
    for (const r of results) {
      if (r.lane !== "tier2_candidate" && r.lane !== "human_review") continue;
      const ticket = ticketById.get(r.id);
      if (!ticket) continue;
      try {
        const s = await tier2.summarize(ticket);
        r.summary = s.text;
        trace.push({
          stage: "tier2_light",
          ticketId: r.id,
          clusterKey: null,
          at: new Date().toISOString(),
          request: s.request,
          response: s.raw,
          intent: r.intent,
          confidence: r.confidence,
          lane: r.lane,
          unsure: r.unsure,
          reasons: [],
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          latencyMs: s.latencyMs,
        });
      } catch (e) {
        const code = e instanceof DecisionError ? e.code : "unknown";
        const msg = e instanceof DecisionError ? e.message : "Tier 2 call failed.";
        r.reasons.push(`Tier 2 summary unavailable (${code}).`);
        trace.push({
          stage: "tier2_light",
          ticketId: r.id,
          clusterKey: null,
          at: new Date().toISOString(),
          request: e instanceof DecisionError ? e.request : null,
          response: null,
          intent: r.intent,
          confidence: r.confidence,
          lane: r.lane,
          unsure: r.unsure,
          reasons: [`${code}: ${msg}`],
          inputTokens: null,
          outputTokens: null,
          latencyMs: null,
        });
      }
    }

    // M2: Tier 2 heavy analysis, only for warranted clusters.
    const groups = new Map<string, TicketResult[]>();
    for (const r of results) {
      if (r.lane === "error" || !r.intent) continue;
      const key = `${r.intent}:${r.lookup?.entity ?? "general"}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    const warrantedClusters = [...groups.entries()]
      .filter(([, list]) => warranted(list))
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_ANALYSES_PER_RUN);
    for (const [key, list] of warrantedClusters) {
      const input: ClusterInput = {
        key,
        title: patternTitle(list[0].intent as string, list[0].lookup),
        tickets: list.map((r) => ({
          id: r.id,
          text: r.text,
          intent: r.intent,
          confidence: r.confidence,
          unsure: r.unsure,
        })),
      };
      const meta = {
        key,
        title: input.title,
        ticketIds: list.map((r) => r.id),
        count: list.length,
        model: MAX_MODEL,
        note: `Model-generated (${MAX_MODEL}) — verify before acting.`,
      };
      try {
        const a = await tier2.analyze(input);
        analyses.push({
          ...meta,
          summary: a.summary,
          likelyCause: a.likelyCause,
          nextStep: a.nextStep,
          caveats: a.caveats,
          inputTokens: a.inputTokens,
          outputTokens: a.outputTokens,
          latencyMs: a.latencyMs,
        });
        trace.push({
          stage: "tier2_heavy",
          ticketId: null,
          clusterKey: key,
          at: new Date().toISOString(),
          request: a.request,
          response: a.raw,
          intent: list[0].intent,
          confidence: null,
          lane: null,
          unsure: false,
          reasons: [],
          inputTokens: a.inputTokens,
          outputTokens: a.outputTokens,
          latencyMs: a.latencyMs,
        });
      } catch (e) {
        const code = e instanceof DecisionError ? e.code : "unknown";
        const msg = e instanceof DecisionError ? e.message : "Tier 2 call failed.";
        analyses.push({
          ...meta,
          summary: "Tier 2 analysis failed for this cluster.",
          likelyCause: null,
          nextStep: null,
          caveats: `No model output (${code}); cluster listed for human review.`,
          inputTokens: null,
          outputTokens: null,
          latencyMs: null,
        });
        trace.push({
          stage: "tier2_heavy",
          ticketId: null,
          clusterKey: key,
          at: new Date().toISOString(),
          request: e instanceof DecisionError ? e.request : null,
          response: null,
          intent: list[0].intent,
          confidence: null,
          lane: null,
          unsure: false,
          reasons: [`${code}: ${msg}`],
          inputTokens: null,
          outputTokens: null,
          latencyMs: null,
        });
      }
    }
  }

  // M1 patterns stay conservative: confident lanes only.
  const groups = new Map<string, TicketResult[]>();
  for (const r of results) {
    if (r.lane === "error" || r.lane === "human_review" || !r.intent) continue;
    const key = `${r.intent}:${r.lookup?.entity ?? "general"}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const patterns: Pattern[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const confidences = list.map((r) => r.confidence ?? 0);
    const entity = list[0].lookup?.entity ?? null;
    patterns.push({
      key,
      title: patternTitle(list[0].intent as string, list[0].lookup),
      intent: list[0].intent as string,
      entity,
      ticketIds: list.map((r) => r.id),
      count: list.length,
      distinctCustomers: new Set(list.map((r) => r.customer)).size,
      evidence: list.slice(0, 5).map((r) => ({ ticketId: r.id, line: r.quotes[0] ?? r.text })),
      confidenceMin: Math.min(...confidences),
      confidenceAvg: confidences.reduce((a, b) => a + b, 0) / confidences.length,
      note: "Observed in synthetic tickets — not verified network truth.",
    });
  }
  patterns.sort((a, b) => b.count - a.count);

  const humanQueue = results
    .filter((r) => r.lane === "human_review")
    .map((r) => ({ id: r.id, reasons: r.reasons, summary: r.summary }));

  const latencies = results.map((r) => r.latencyMs).filter((x): x is number => typeof x === "number");
  const lanes: Record<string, number> = {};
  for (const r of results) lanes[r.lane] = (lanes[r.lane] ?? 0) + 1;

  const usage = (stage: TraceEntry["stage"]): Tier2Usage => {
    const list = trace.filter((t) => t.stage === stage);
    const lat = list.map((t) => t.latencyMs).filter((x): x is number => typeof x === "number");
    return {
      calls: list.length,
      inputTokens: list.reduce((s, t) => s + (t.inputTokens ?? 0), 0),
      outputTokens: list.reduce((s, t) => s + (t.outputTokens ?? 0), 0),
      avgLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
    };
  };

  const partial: Omit<TriageResult, "brief"> = {
    ok: true,
    mode,
    telco: `${TELCO} (fictional)`,
    synthetic: true,
    batchLabel: BATCH_LABEL,
    generatedAt: new Date().toISOString(),
    tickets: results,
    patterns,
    analyses,
    humanQueue,
    stats: {
      tickets: results.length,
      tier1Calls: results.filter((r) => r.intent !== null).length,
      inputTokens: results.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      lanes,
      patterns: patterns.length,
      errors: lanes.error ?? 0,
      tier2: { light: usage("tier2_light"), heavy: usage("tier2_heavy") },
    },
    trace,
  };
  return { ...partial, brief: buildBrief(partial) };
}