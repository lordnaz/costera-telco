// Tier 1 classifier client for decision-model-preview.
// Secrets are read server-side only via the injected EnvReader. Never log or return them.
//
// RESPONSE parsing follows the verified shape in BOUNTY_BRIEF.md:
//   { model, request_id, answers: { <field>: { type, choice, confidence, probabilities } },
//     usage: { input_tokens }, latency_ms }
// REQUEST contract owner-verified: POST {base}/systemone with
//   { model, state: { ticket_id, content }, questions: { <field>: { type, instructions, criteria } } }
// M1 asks choice-type questions only; score/noul response shapes are verified in M2.
// Each Decision carries `request` (body sent) and `raw` (response received) for run logs.
// Logs must never include headers, the API key, or the endpoint hostname.

import type { Ticket } from "./data.ts";

export interface DecisionField {
  type: string;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface Decision {
  fields: Record<string, DecisionField>;
  inputTokens: number | null;
  latencyMs: number | null;
  requestId: string | null;
  request: unknown;
  raw: unknown;
}

export type ClassifyFn = (ticket: Ticket) => Promise<Decision>;
export type EnvReader = (name: string) => string | undefined;

export const DECISION_MODEL = "decision-model-preview";
export const INTENT_CHOICES = ["billing", "technical", "account", "roaming", "other"];
export const COMPLEXITY_CHOICES = ["routine", "complex"];

export class DecisionError extends Error {
  code: string;
  request: unknown;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.request = null;
  }
}

export function parseDecision(json: unknown, fallbackLatencyMs: number): Decision {
  if (typeof json !== "object" || json === null) {
    throw new DecisionError("decision_contract_mismatch", "Unexpected decision response shape.");
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.answers !== "object" || obj.answers === null) {
    throw new DecisionError("decision_contract_mismatch", "Decision response has no answers object.");
  }
  const fields: Record<string, DecisionField> = {};
  for (const [name, raw] of Object.entries(obj.answers as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.choice !== "string" || typeof f.confidence !== "number") {
      throw new DecisionError("decision_contract_mismatch", `Decision field ${name} is malformed.`);
    }
    const probabilities: Record<string, number> = {};
    if (typeof f.probabilities === "object" && f.probabilities !== null) {
      for (const [k, v] of Object.entries(f.probabilities as Record<string, unknown>)) {
        if (typeof v === "number") probabilities[k] = v;
      }
    }
    fields[name] = {
      type: typeof f.type === "string" ? f.type : "choice",
      choice: f.choice,
      confidence: f.confidence,
      probabilities,
    };
  }
  const usage = obj.usage as Record<string, unknown> | undefined;
  return {
    fields,
    inputTokens: usage && typeof usage.input_tokens === "number" ? usage.input_tokens : null,
    latencyMs: typeof obj.latency_ms === "number" ? obj.latency_ms : fallbackLatencyMs,
    requestId: typeof obj.request_id === "string" ? obj.request_id : null,
    request: null,
    raw: json,
  };
}

export function buildDecisionRequest(ticket: Ticket): { endpointPath: string; body: unknown } {
  return {
    endpointPath: "systemone",
    body: {
      model: DECISION_MODEL,
      state: { ticket_id: ticket.id, content: ticket.text },
      questions: {
        intent: {
          type: "choice",
          instructions:
            "Classify the ticket's primary intent into exactly one category. Pick the best-fitting specific category; use 'other' only if the text truly fits none of them.",
          criteria: {
            billing:
              "Anything about money: bills, charges, fees, proration, plan-change costs, payments, refunds, credits",
            technical:
              "Anything about service working: no data, no signal, outages, slow connection, SIM or device faults",
            account: "Questions about account state: balance, current plan, bill due dates, account status",
            roaming: "Travel, roaming add-on activation and international usage",
            other: "Only if the ticket fits none of the above, e.g. vague or unrelated text",
          },
        },
        complexity: {
          type: "choice",
          instructions: "How complex is resolving this ticket?",
          criteria: {
            routine: "Answerable by a deterministic lookup or a standard procedure",
            complex: "Needs cross-ticket analysis or judgement beyond a lookup",
          },
        },
      },
    },
  };
}

export function createDecisionClassifier(env: EnvReader): ClassifyFn {
  return async (ticket: Ticket): Promise<Decision> => {
    const key = env("COSTERA_API_KEY");
    const base = env("COSTERA_API_BASE_URL");
    if (!key || !base) {
      throw new DecisionError("service_not_configured", "Server secrets are not configured.");
    }
    let baseUrl: URL;
    try {
      baseUrl = new URL(base);
    } catch {
      throw new DecisionError("invalid_base_url", "Server endpoint configuration is invalid.");
    }
    if (baseUrl.protocol !== "https:") {
      throw new DecisionError("invalid_base_url", "Server endpoint must use HTTPS.");
    }
    const { endpointPath, body } = buildDecisionRequest(ticket);
    const href = baseUrl.href.endsWith("/") ? baseUrl.href : baseUrl.href + "/";
    const endpoint = new URL(endpointPath, href);

    const started = Date.now();
    try {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw new DecisionError("upstream_unreachable", "Classification service is unreachable.");
      }
      if (!res.ok) {
        throw new DecisionError("upstream_error", `Classification service returned HTTP ${res.status}.`);
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new DecisionError("decision_contract_mismatch", "Classification service returned non-JSON.");
      }
      const decision = parseDecision(json, Date.now() - started);
      decision.request = body;
      return decision;
    } catch (e) {
      if (e instanceof DecisionError) e.request = body;
      throw e;
    }
  };
}