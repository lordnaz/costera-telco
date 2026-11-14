// DEV-ONLY fixture classifier. Simulates decision-model-preview responses so the
// walking skeleton can be exercised without credentials. Never deployed: the
// published Function has no fixture path and returns service_not_configured instead.
import { buildDecisionRequest } from "../server/decision.ts";
import type { ClassifyFn } from "../server/decision.ts";

type Fixture = {
  intent: [string, number, Record<string, number>];
  complexity: [string, number];
  tokens: number;
  latency: number;
};

const P_BILLING: Record<string, number> = { billing: 0.95, technical: 0.03, account: 0.02 };
const P_TECH: Record<string, number> = { technical: 0.93, billing: 0.04, other: 0.03 };
const P_ACCOUNT: Record<string, number> = { account: 0.96, billing: 0.03, other: 0.01 };

const FIXTURES: Record<string, Fixture> = {
  "ZT-1001": { intent: ["billing", 0.96, P_BILLING], complexity: ["routine", 0.9], tokens: 78, latency: 269 },
  "ZT-1002": { intent: ["billing", 0.94, P_BILLING], complexity: ["routine", 0.88], tokens: 74, latency: 241 },
  "ZT-1003": { intent: ["technical", 0.95, P_TECH], complexity: ["routine", 0.92], tokens: 71, latency: 233 },
  "ZT-1004": { intent: ["account", 0.97, P_ACCOUNT], complexity: ["routine", 0.95], tokens: 62, latency: 205 },
  "ZT-1005": { intent: ["billing", 0.93, P_BILLING], complexity: ["complex", 0.7], tokens: 76, latency: 288 },
  "ZT-1006": { intent: ["technical", 0.91, P_TECH], complexity: ["complex", 0.75], tokens: 82, latency: 301 },
  "ZT-1007": { intent: ["account", 0.95, P_ACCOUNT], complexity: ["routine", 0.93], tokens: 66, latency: 214 },
  "ZT-1008": { intent: ["billing", 0.95, P_BILLING], complexity: ["routine", 0.9], tokens: 73, latency: 252 },
  "ZT-1009": { intent: ["technical", 0.94, P_TECH], complexity: ["routine", 0.91], tokens: 75, latency: 247 },
  "ZT-1010": { intent: ["technical", 0.92, P_TECH], complexity: ["routine", 0.9], tokens: 69, latency: 226 },
  "ZT-1011": { intent: ["billing", 0.96, P_BILLING], complexity: ["routine", 0.92], tokens: 77, latency: 263 },
  "ZT-1012": { intent: ["account", 0.96, P_ACCOUNT], complexity: ["routine", 0.94], tokens: 60, latency: 198 },
  "ZT-1013": { intent: ["technical", 0.93, P_TECH], complexity: ["routine", 0.9], tokens: 72, latency: 239 },
  "ZT-1014": { intent: ["roaming", 0.94, { roaming: 0.94, account: 0.04, other: 0.02 }], complexity: ["routine", 0.92], tokens: 68, latency: 221 },
  "ZT-1015": { intent: ["other", 0.45, { other: 0.45, billing: 0.3, technical: 0.25 }], complexity: ["complex", 0.5], tokens: 55, latency: 190 },
  "ZT-1016": { intent: ["billing", 0.95, P_BILLING], complexity: ["routine", 0.9], tokens: 79, latency: 274 },
  "ZT-1017": { intent: ["billing", 0.88, { billing: 0.88, account: 0.08, other: 0.04 }], complexity: ["complex", 0.72], tokens: 70, latency: 256 },
  "ZT-1018": { intent: ["technical", 0.95, P_TECH], complexity: ["routine", 0.93], tokens: 67, latency: 218 },
  "ZT-1019": { intent: ["technical", 0.9, P_TECH], complexity: ["routine", 0.89], tokens: 74, latency: 244 },
  "ZT-1020": { intent: ["other", 0.4, { other: 0.4, technical: 0.35, billing: 0.25 }], complexity: ["complex", 0.55], tokens: 64, latency: 209 },
  "ZT-1021": { intent: ["billing", 0.85, { billing: 0.85, technical: 0.1, account: 0.05 }], complexity: ["complex", 0.7], tokens: 76, latency: 281 },
  "ZT-1022": { intent: ["billing", 0.97, P_BILLING], complexity: ["routine", 0.93], tokens: 80, latency: 292 },
};

export const fixtureClassify: ClassifyFn = async (ticket) => {
  const f = FIXTURES[ticket.id] ?? {
    intent: ["other", 0.5, { other: 0.5, billing: 0.25, technical: 0.25 }],
    complexity: ["routine", 0.6],
    tokens: 60,
    latency: 200,
  };
  return {
    fields: {
      intent: { type: "choice", choice: f.intent[0], confidence: f.intent[1], probabilities: f.intent[2] },
      complexity: { type: "choice", choice: f.complexity[0], confidence: f.complexity[1], probabilities: {} },
    },
    inputTokens: f.tokens,
    latencyMs: f.latency,
    requestId: `fixture-${ticket.id}`,
    request: buildDecisionRequest(ticket).body,
    raw: {
      model: "decision-model-preview",
      request_id: `fixture-${ticket.id}`,
      answers: {
        intent: { type: "choice", choice: f.intent[0], confidence: f.intent[1], probabilities: f.intent[2] },
        complexity: { type: "choice", choice: f.complexity[0], confidence: f.complexity[1], probabilities: {} },
      },
      usage: { input_tokens: f.tokens },
      latency_ms: f.latency,
    },
  };
};