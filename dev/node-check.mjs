// DEV-ONLY credential-free handler checks on Node (Deno unavailable on this host).
// Exercises the actual deployed handler logic with an injected fixture classifier.
// Deno-specific validation (deno check) remains pending until a Deno runtime exists.
import assert from "node:assert/strict";
import { createHandler } from "../server/handler.ts";
import { parseDecision } from "../server/decision.ts";
import { fixtureClassify } from "./fixtures.ts";
import { fixtureAnalyze, fixtureSummarize } from "./fixtures-tier2.ts";

const BASE = "http://127.0.0.1:8000/api";
const fixtureHandler = createHandler(() => undefined, { classify: fixtureClassify });
const unconfiguredLive = createHandler(() => undefined);

async function call(handler, path, method = "GET", body) {
  const init = { method };
  if (body !== undefined) {
    init.body = body;
    init.headers = { "Content-Type": "application/json" };
  }
  return handler(new Request(`${BASE}${path}`, init));
}

// 1. health
{
  const res = await call(fixtureHandler, "/health");
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.ok, true);
  assert.equal(j.mode, "fixture");
  assert.equal(j.configured, false);
  console.log("PASS health");
}

// 2. batch
{
  const res = await call(fixtureHandler, "/batch");
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.synthetic, true);
  assert.equal(j.tickets.length, 22);
  console.log("PASS batch (22 synthetic tickets)");
}

// 3. full triage through the real handler + fixture Tier 1
{
  const res = await call(fixtureHandler, "/triage", "POST", "{}");
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.ok, true);
  assert.equal(j.mode, "fixture");
  assert.equal(j.tickets.length, 22);
  assert.equal(j.stats.tier1Calls, 22);
  const billing = j.patterns.find((p) => p.key === "billing:Streamline 60");
  const outage = j.patterns.find((p) => p.key === "technical:OUT-2071");
  assert.ok(billing, "billing pattern missing");
  assert.equal(billing.count, 7);
  assert.equal(billing.distinctCustomers, 6);
  assert.ok(outage, "outage pattern missing");
  assert.equal(outage.count, 5);
  assert.ok(billing.evidence.every((e) => e.ticketId && e.line));
  const humanIds = j.humanQueue.map((h) => h.id);
  for (const id of ["ZT-1015", "ZT-1017", "ZT-1020", "ZT-1021"]) {
    assert.ok(humanIds.includes(id), `${id} should be in human queue`);
  }
  const unsure = j.tickets.find((t) => t.id === "ZT-1015");
  assert.equal(unsure.unsure, true);
  assert.equal(unsure.lane, "human_review");
  assert.ok(j.brief.includes("ESCALATION DRAFT"));
  assert.ok(j.brief.includes("not verified network truth"));
  assert.ok(j.stats.inputTokens > 0);
  console.log("PASS triage (patterns, evidence, human queue, unsure flag, brief)");
}

// 4. live mode without secrets -> stable service_not_configured, no fixture fallback
{
  const res = await call(unconfiguredLive, "/triage", "POST", "{}");
  const j = await res.json();
  assert.equal(res.status, 503);
  assert.equal(j.error, "service_not_configured");
  console.log("PASS unconfigured live mode returns 503 service_not_configured");
}

// 5. routing hygiene
{
  const notFound = await call(fixtureHandler, "/nope");
  assert.equal(notFound.status, 404);
  const wrongMethod = await call(fixtureHandler, "/triage", "GET");
  assert.equal(wrongMethod.status, 405);
  const badBody = await call(fixtureHandler, "/triage", "POST", "not json");
  assert.equal(badBody.status, 400);
  const unknownId = await call(fixtureHandler, "/triage", "POST", JSON.stringify({ ticketIds: ["ZT-9999"] }));
  assert.equal(unknownId.status, 400);
  console.log("PASS 404 / 405 / 400 handling");
}

// 6. subset triage
{
  const res = await call(fixtureHandler, "/triage", "POST", JSON.stringify({ ticketIds: ["ZT-1001", "ZT-1002", "ZT-1005"] }));
  const j = await res.json();
  assert.equal(j.tickets.length, 3);
  assert.equal(j.patterns.length, 1);
  assert.equal(j.patterns[0].count, 3);
  console.log("PASS subset triage (3-ticket pattern threshold)");
}

// 7. decision response parsing against the verified sample from BOUNTY_BRIEF.md
{
  const sample = {
    model: "decision-model-preview",
    request_id: "req-123",
    answers: {
      department: { type: "choice", choice: "billing", confidence: 0.95, probabilities: { billing: 0.98, technical: 0.02 } },
    },
    usage: { input_tokens: 78 },
    latency_ms: 269.7,
  };
  const d = parseDecision(sample, 999);
  assert.equal(d.fields.department.choice, "billing");
  assert.equal(d.fields.department.confidence, 0.95);
  assert.equal(d.fields.department.probabilities.billing, 0.98);
  assert.equal(d.inputTokens, 78);
  assert.equal(d.latencyMs, 269.7);
  assert.throws(() => parseDecision({ choices: [{ message: { content: "hi" } }] }, 0));
  console.log("PASS parseDecision (verified shape accepted, chat shape rejected)");
}

// 8. run log sink captures per-ticket request + response; trace opt-in in response
{
  const runs = [];
  const h = createHandler(() => undefined, { classify: fixtureClassify, sink: (r) => runs.push(r) });
  const res = await call(h, "/triage", "POST", "{}");
  const j = await res.json();
  assert.equal(j.trace, undefined);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trace.filter((e) => e.stage === "tier1").length, 22);
  const e = runs[0].trace[0];
  assert.equal(e.request.model, "decision-model-preview");
  assert.ok(e.request.state.ticket_id);
  assert.ok(e.response.answers.intent);
  assert.ok(runs[0].runId && runs[0].at);
  const res2 = await call(h, "/triage", "POST", JSON.stringify({ includeTrace: true }));
  const j2 = await res2.json();
  assert.equal(j2.trace.filter((t) => t.stage === "tier1").length, 22);
  console.log("PASS run log sink (per-ticket request/response) + includeTrace opt-in");
}

// 9. M2: tier2 lanes produce summaries, warranted analyses, brief section, trace stages
{
  const h = createHandler(() => undefined, {
    classify: fixtureClassify,
    tier2: { summarize: fixtureSummarize, analyze: fixtureAnalyze },
  });
  const res = await call(h, "/triage", "POST", "{}");
  const j = await res.json();
  const cand = j.tickets.find((t) => t.id === "ZT-1015");
  assert.ok(cand.summary && cand.summary.length > 0);
  const human = j.humanQueue.find((x) => x.id === "ZT-1017");
  assert.ok(human.summary && human.summary.length > 0);
  assert.ok(j.analyses.length >= 1);
  assert.ok(j.analyses.every((a) => a.note.includes("Model-generated")));
  assert.ok(j.brief.includes("TIER 2 FINDINGS"));
  assert.ok(j.stats.tier2.light.calls > 0 && j.stats.tier2.heavy.calls > 0);
  const res2 = await call(h, "/triage", "POST", JSON.stringify({ includeTrace: true }));
  const j2 = await res2.json();
  assert.ok(j2.trace.some((t) => t.stage === "tier2_light"));
  assert.ok(j2.trace.some((t) => t.stage === "tier2_heavy" && t.clusterKey));
  console.log("PASS M2 tier2 lanes (summaries, warranted analyses, brief section, trace stages)");
}

// 10. M3 cost math: routed below baseline, savings in range
{
  const { computeCost, DEFAULT_RATES, laneCosts } = await import("../src/cost.ts");
  const stats = {
    tickets: 22,
    tier1Calls: 22,
    inputTokens: 4688,
    avgLatencyMs: 400,
    lanes: { direct: 11 },
    patterns: 2,
    errors: 0,
    tier2: {
      light: { calls: 11, inputTokens: 1271, outputTokens: 2312, avgLatencyMs: 3000 },
      heavy: { calls: 3, inputTokens: 1145, outputTokens: 2066, avgLatencyMs: 16000 },
    },
  };
  const c = computeCost(stats, DEFAULT_RATES);
  assert.ok(c.routed > 0);
  assert.ok(c.baseline > c.routed);
  assert.ok(c.savingsPct > 0 && c.savingsPct < 100);
  const lc = laneCosts(stats, DEFAULT_RATES);
  assert.ok(lc.direct === 0);
  assert.ok(Math.abs(lc.tier1 + lc.flash + lc.max - c.routed) < 1e-9);
  console.log("PASS M3 cost math (routed < baseline, savings in range, lane costs sum to routed)");
}

console.log("ALL CHECKS PASSED");