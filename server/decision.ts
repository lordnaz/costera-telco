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
export const CHAT_CLASSIFIER_MODEL = "deepseek-chat";
export type DecisionEngine = "systemone" | "chat";
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

export function buildDecisionRequest(ticket: Ticket, model: string = DECISION_MODEL): { endpointPath: string; body: unknown } {
  return {
    endpointPath: "systemone",
    body: {
      model,
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

// Chat-engine alternative: any chat model (e.g. the flagship) acts as the classifier
// through /chat/completions with a strict JSON prompt. Confidence is self-reported by
// the model (no calibrated probabilities), which the UI labels accordingly.
export function buildChatClassifyRequest(ticket: Ticket, model: string): { endpointPath: string; body: unknown } {
  return {
    endpointPath: "chat/completions",
    body: {
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'You are the Tier 1 classifier for a telecom support triage desk. Reply with ONLY a JSON object: {"intent": {"choice": string, "confidence": number}, "complexity": {"choice": string, "confidence": number}}. intent.choice must be exactly one of billing, technical, account, roaming, other. billing = money: bills, charges, fees, proration, plan-change costs, payments, refunds, credits. technical = service working: no data, no signal, outages, slow connection, SIM or device faults. account = account state: balance, current plan, bill due dates, account status. roaming = travel, roaming add-ons, international usage. other = only if the text truly fits none of them. complexity.choice must be routine (answerable by a deterministic lookup or standard procedure) or complex (needs cross-ticket analysis or judgement). confidence is your calibrated certainty from 0 to 1; use low values when the text is vague or ambiguous. Never invent facts.',
        },
        { role: "user", content: `Ticket ${ticket.id}: ${ticket.text}` },
      ],
    },
  };
}

function stripFences(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) return t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  return t;
}

export function parseChatDecision(json: unknown, fallbackLatencyMs: number): Decision {
  const mismatch = (msg: string) => new DecisionError("decision_contract_mismatch", msg);
  if (typeof json !== "object" || json === null) throw mismatch("Unexpected chat response shape.");
  const obj = json as Record<string, unknown>;
  const choices = obj.choices as { message?: { content?: unknown } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") throw mismatch("Chat response has no message content.");
  let parsed: Record<string, unknown>;
  try {
    const candidate = JSON.parse(stripFences(content));
    if (typeof candidate !== "object" || candidate === null) throw new Error("not an object");
    parsed = candidate as Record<string, unknown>;
  } catch {
    throw mismatch("Chat classifier returned non-JSON content.");
  }
  const field = (name: string, allowed: string[]): DecisionField => {
    const raw = parsed[name];
    if (typeof raw !== "object" || raw === null) throw mismatch(`Chat classifier field ${name} is missing.`);
    const f = raw as Record<string, unknown>;
    if (typeof f.choice !== "string" || !allowed.includes(f.choice)) {
      throw mismatch(`Chat classifier field ${name} has an invalid choice.`);
    }
    if (typeof f.confidence !== "number" || !Number.isFinite(f.confidence)) {
      throw mismatch(`Chat classifier field ${name} has no numeric confidence.`);
    }
    return {
      type: "choice",
      choice: f.choice,
      confidence: Math.min(1, Math.max(0, f.confidence)),
      probabilities: {},
    };
  };
  const usage = obj.usage as Record<string, unknown> | undefined;
  return {
    fields: { intent: field("intent", INTENT_CHOICES), complexity: field("complexity", COMPLEXITY_CHOICES) },
    inputTokens: usage && typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    latencyMs: fallbackLatencyMs,
    requestId: typeof obj.id === "string" ? obj.id : null,
    request: null,
    raw: json,
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
    const engine: DecisionEngine = env("COSTERA_DECISION_ENGINE") === "chat" ? "chat" : "systemone";
    const model = env("COSTERA_MODEL") || (engine === "chat" ? CHAT_CLASSIFIER_MODEL : DECISION_MODEL);
    const { endpointPath, body } =
      engine === "chat" ? buildChatClassifyRequest(ticket, model) : buildDecisionRequest(ticket, model);
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
          signal: AbortSignal.timeout(engine === "chat" ? 30000 : 20000),
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
      const decision =
        engine === "chat" ? parseChatDecision(json, Date.now() - started) : parseDecision(json, Date.now() - started);
      decision.request = body;
      return decision;
    } catch (e) {
      if (e instanceof DecisionError) e.request = body;
      throw e;
    }
  };
}