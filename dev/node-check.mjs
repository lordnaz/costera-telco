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

// 11. Session credentials: validation, SSRF guard, per-tier override, no env fallback
{
  const { createHandler } = await import("../server/handler.ts");
  const {
    parseSessionCredentials,
    effectiveCredentials,
    sessionActive,
    assertPublicHttpsUrl,
    CredentialsError,
    ReviewerAccessError,
  } = await import("../server/credentials.ts");
  const h = createHandler(() => undefined);
  const post = (path, body) =>
    h(new Request(`http://local/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
  let r = await post("triage", {});
  assert.equal(r.status, 503);
  r = await post("triage", { credentials: { key: "k", baseUrl: "http://127.0.0.1:8000/v1" } });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "invalid_credentials");
  r = await post("credentials", { tier: "decision", key: "k", baseUrl: "https://169.254.169.254/latest/" });
  assert.equal(r.status, 400);
  r = await post("credentials", { tier: "nope", key: "k", baseUrl: "https://example.com/v1" });
  assert.equal(r.status, 400);
  const s = parseSessionCredentials({
    key: "shared",
    baseUrl: "https://example.com/v1",
    tiers: { decision: { key: "d" } },
  });
  assert.ok(sessionActive(s));
  const eff = effectiveCredentials(s, () => "owner-secret");
  assert.equal(eff.tiers.decision.key, "d");
  assert.equal(eff.tiers.flash.key, "shared");
  assert.equal(eff.tiers.max.baseUrl, "https://example.com/v1");
  const envReader = (n) =>
    n === "COSTERA_API_KEY" ? "owner" : n === "COSTERA_API_BASE_URL" ? "https://owner.example/v1" : undefined;
  const effNoDemo = effectiveCredentials(null, envReader);
  assert.equal(effNoDemo.tiers.decision.key, "");
  const effDemo = effectiveCredentials(null, envReader, true);
  assert.equal(effDemo.tiers.decision.key, "owner");
  assert.equal(effDemo.tiers.max.baseUrl, "https://owner.example/v1");
  const effDemoSession = effectiveCredentials(s, envReader, true);
  assert.equal(effDemoSession.tiers.decision.key, "owner");
  assert.throws(() => effectiveCredentials(null, () => undefined, true), ReviewerAccessError);
  assert.throws(() => assertPublicHttpsUrl("https://10.0.0.5/v1"), CredentialsError);
  assert.throws(() => assertPublicHttpsUrl("https://localhost/v1"), CredentialsError);
  assert.throws(() => assertPublicHttpsUrl("https://example.com:8443/v1"), CredentialsError);
  console.log("PASS session credentials (validation, SSRF guard, per-tier override, no env fallback)");
}

// 12. Chat-engine classifier: flagship model can classify via /chat/completions
{
  const { createDecisionClassifier } = await import("../server/decision.ts");
  const ticket = { id: "ZT-9001", createdAt: "2026-11-14T00:00:00Z", channel: "chat", customer: "cust_900", text: "My bill jumped after the plan change." };
  const env = (n) =>
    n === "COSTERA_API_KEY" ? "k"
    : n === "COSTERA_API_BASE_URL" ? "https://example.com/v1"
    : n === "COSTERA_DECISION_ENGINE" ? "chat"
    : n === "COSTERA_MODEL" ? "qwen3.8-max"
    : undefined;
  const origFetch = globalThis.fetch;
  let lastUrl = "";
  globalThis.fetch = async (url) => {
    lastUrl = String(url);
    return new Response(
      JSON.stringify({
        id: "chat-1",
        choices: [{ message: { content: '```json\n{"intent":{"choice":"billing","confidence":0.82},"complexity":{"choice":"routine","confidence":0.9}}\n```' } }],
        usage: { prompt_tokens: 120, completion_tokens: 40 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const classify = createDecisionClassifier(env);
    const d = await classify(ticket);
    assert.ok(lastUrl.endsWith("/chat/completions"));
    assert.equal(d.fields.intent.choice, "billing");
    assert.ok(Math.abs(d.fields.intent.confidence - 0.82) < 1e-9);
    assert.equal(d.fields.complexity.choice, "routine");
    assert.equal(d.inputTokens, 120);
    assert.deepEqual(d.fields.intent.probabilities, {});
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(() => classify(ticket), (e) => e.code === "decision_contract_mismatch");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":{"choice":"nope","confidence":0.9},"complexity":{"choice":"routine","confidence":0.9}}' } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(() => classify(ticket), (e) => e.code === "decision_contract_mismatch");
  } finally {
    globalThis.fetch = origFetch;
  }
  console.log("PASS chat-engine classifier (flagship via chat/completions, strict parse, bad choice rejected)");
}

// 13. Per-model pricing: all-flagship vs tiered comparison
{
  const { computeCost, ratesForModels, DEFAULT_RATES } = await import("../src/cost.ts");
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
  const flagship = { decision: "gpt-6", flash: "gpt-6", max: "gpt-6" };
  const tiered = { decision: "deepseek-chat", flash: "qwen3.8-flash", max: "gpt-6" };
  const cf = computeCost(stats, ratesForModels(flagship));
  const ct = computeCost(stats, ratesForModels(tiered));
  assert.ok(Math.abs(cf.routed - cf.baseline) < 1e-9);
  assert.ok(cf.savingsPct === null || Math.abs(cf.savingsPct) < 1e-9);
  assert.ok(ct.routed < cf.routed);
  assert.ok(ct.savingsPct > 0);
  const custom = ratesForModels({ decision: "my-model", flash: "my-model", max: "my-model" });
  assert.deepEqual(custom, DEFAULT_RATES);
  console.log("PASS per-model pricing (all-flagship = baseline, tiered cheaper, custom fallback)");
}

// 14. Model catalogue: classifier-only stays off the chat lists, and BOTH Tier 2 lanes list the
//     full chat catalogue (light → flagship), so any model can serve any tier.
{
  const { MODELS, DECISION_CONTRACT_OPTIONS, CHAT_OPTIONS, RECOMMENDED_BY_TIER } = await import("../src/models.ts");
  const { ratesForModels } = await import("../src/cost.ts");
  const jeff = MODELS.find((m) => m.id === "jeff");
  assert.ok(jeff && jeff.classifierOnly);
  assert.equal(
    MODELS.filter((m) => m.recommended).map((m) => m.id).join(","),
    "decision-model-preview,qwen3.8-flash,qwen3.8-max",
  );
  assert.deepEqual(RECOMMENDED_BY_TIER.decision, ["decision-model-preview", "jeff"]);
  assert.deepEqual(RECOMMENDED_BY_TIER.flash, ["qwen3.8-flash"]);
  assert.deepEqual(RECOMMENDED_BY_TIER.max, ["qwen3.8-max"]);
  assert.ok(DECISION_CONTRACT_OPTIONS.some((m) => m.id === "jeff"));
  assert.ok(!CHAT_OPTIONS.some((m) => m.classifierOnly), "classifier-only models must stay off chat lists");
  for (const id of ["qwen3.8-flash", "qwen3.8-max", "deepseek-chat", "claude-opus-4-5", "kimi-k2-thinking"]) {
    assert.ok(CHAT_OPTIONS.some((m) => m.id === id), `Tier 2 lists must include ${id}`);
  }
  const r = ratesForModels({ decision: "jeff", flash: "qwen3.8-max", max: "qwen3.8-flash" });
  assert.equal(r.decisionIn, 0.3);
  assert.equal(r.decisionOut, 0.6);
  assert.equal(r.flashIn, 1.6); // flagship priced on the light lane
  assert.equal(r.maxIn, 0.1); // light priced on the heavy lane
  console.log("PASS model catalogue (classifier-only off chat lists, both Tier 2 lanes list light + flagship)");
}

// 15. Temporary reviewer access: explicit opt-in only, no silent env fallback, no secret leakage
{
  const { createHandler } = await import("../server/handler.ts");
  const { fixtureClassify } = await import("./fixtures.ts");
  const { fixtureAnalyze, fixtureSummarize } = await import("./fixtures-tier2.ts");
  const env = (n) =>
    n === "COSTERA_API_KEY" ? "owner-secret-key" : n === "COSTERA_API_BASE_URL" ? "https://owner.example/v1" : undefined;
  const h = createHandler(env, {
    classify: fixtureClassify,
    tier2: { summarize: fixtureSummarize, analyze: fixtureAnalyze },
  });
  const post = (path, body) =>
    h(new Request(`http://local/api/${path}`, { method: "POST", body: JSON.stringify(body) }));
  // env configured, but no opt-in and no session key → still refused (no silent fallback)
  const hLive = createHandler(env);
  let r = await hLive(new Request("http://local/api/triage", { method: "POST", body: JSON.stringify({}) }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "service_not_configured");
  // explicit opt-in runs on the env key and reports it honestly
  r = await post("triage", {
    demoAccess: true,
    credentials: {
      tiers: {
        decision: { model: "decision-model-preview" },
        flash: { model: "qwen3.8-flash" },
        max: { model: "qwen3.8-max" },
      },
    },
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.keySource, "env");
  assert.equal(j.models.decision, "decision-model-preview");
  // availability endpoint exposes model names only — never the key or hostname
  r = await h(new Request("http://local/api/demo-access"));
  const info = await r.json();
  assert.equal(info.available, true);
  assert.ok(info.models && info.models.flash.length > 0);
  const raw = JSON.stringify(info);
  assert.ok(!raw.includes("owner-secret-key") && !raw.includes("owner.example"));
  // without env, opt-in is refused on both triage and the connection test
  const hEmpty = createHandler(() => undefined, { classify: fixtureClassify });
  r = await hEmpty(new Request("http://local/api/credentials", { method: "POST", body: JSON.stringify({ tier: "decision", demo: true }) }));
  assert.equal((await r.json()).error, "reviewer_access_unavailable");
  r = await hEmpty(new Request("http://local/api/triage", { method: "POST", body: JSON.stringify({ demoAccess: true }) }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "reviewer_access_unavailable");
  console.log("PASS temporary reviewer access (opt-in only, no silent fallback, no secret leakage)");
}

console.log("ALL CHECKS PASSED");