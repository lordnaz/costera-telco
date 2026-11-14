// DEV-ONLY credential-free handler checks on Node (Deno unavailable on this host).
// Exercises the actual deployed handler logic with an injected fixture classifier.
// Deno-specific validation (deno check) remains pending until a Deno runtime exists.
import assert from "node:assert/strict";
import { createHandler } from "../server/handler.ts";
import { parseDecision } from "../server/decision.ts";
import { fixtureClassify } from "./fixtures.ts";

const BASE = "http://127.0.0.1:8000/api";
const fixtureHandler = createHandler(() => undefined, fixtureClassify);
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

console.log("ALL CHECKS PASSED");