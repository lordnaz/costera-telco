// Tier 2 lanes (M2): light = qwen3.8-flash plain-language summaries,
// heavy = qwen-max cross-ticket cluster analysis, invoked only when warranted.
// Chat-completions contract verified live for both models.
// Secrets server-side only; errors are stable codes; request/raw carried for run logs.

import type { Ticket } from "./data.ts";
import { DecisionError } from "./decision.ts";
import type { EnvReader } from "./decision.ts";
import { chatEndpoint } from "./endpoints.ts";

export const FLASH_MODEL = "qwen3.8-flash";
export const MAX_MODEL = "qwen3.8-max";

export interface Tier2Call {
  request: unknown;
  raw: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
}

export interface Summary extends Tier2Call {
  text: string;
}

export interface ClusterInput {
  key: string;
  title: string;
  tickets: {
    id: string;
    text: string;
    intent: string | null;
    confidence: number | null;
    unsure: boolean;
  }[];
}

export interface Analysis extends Tier2Call {
  summary: string;
  likelyCause: string | null;
  nextStep: string | null;
  caveats: string | null;
}

export type SummarizeFn = (ticket: Ticket) => Promise<Summary>;
export type AnalyzeFn = (cluster: ClusterInput) => Promise<Analysis>;

interface ChatOutcome extends Tier2Call {
  content: string;
}

async function chatCall(
  env: EnvReader,
  model: string,
  messages: unknown[],
  timeoutMs = 30000,
): Promise<ChatOutcome> {
  const key = env("COSTERA_API_KEY");
  const base = env("COSTERA_API_BASE_URL");
  if (!key || !base) throw new DecisionError("service_not_configured", "Server secrets are not configured.");
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new DecisionError("invalid_base_url", "Server endpoint configuration is invalid.");
  }
  if (baseUrl.protocol !== "https:") throw new DecisionError("invalid_base_url", "Server endpoint must use HTTPS.");
  const body = { model, messages };
  const started = Date.now();
  try {
    let res: Response;
    try {
      res = await fetch(chatEndpoint(base), {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new DecisionError("tier2_unreachable", "Tier 2 service is unreachable.");
    }
    if (!res.ok) throw new DecisionError("tier2_error", `Tier 2 service returned HTTP ${res.status}.`);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new DecisionError("tier2_contract_mismatch", "Tier 2 service returned non-JSON.");
    }
    const obj = json as Record<string, unknown>;
    const choices = obj.choices as { message?: { content?: unknown } }[] | undefined;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new DecisionError("tier2_contract_mismatch", "Tier 2 response has no message content.");
    }
    const usage = obj.usage as Record<string, unknown> | undefined;
    return {
      content,
      request: body,
      raw: json,
      inputTokens: usage && typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens: usage && typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    if (e instanceof DecisionError) e.request = body;
    throw e;
  }
}

export function createFlashSummarizer(env: EnvReader): SummarizeFn {
  return async (ticket: Ticket): Promise<Summary> => {
    const out = await chatCall(env, env("COSTERA_MODEL") || FLASH_MODEL, [
      {
        role: "system",
        content:
          "You summarise telecom support tickets for a support agent. Reply with 1-2 plain sentences. Preserve concrete details (plan names, areas, amounts, durations). Never invent facts not present in the ticket.",
      },
      { role: "user", content: ticket.text },
    ]);
    return { ...out, text: out.content.trim() };
  };
}

function stripFences(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }
  return t;
}

export function createMaxAnalyzer(env: EnvReader): AnalyzeFn {
  return async (cluster: ClusterInput): Promise<Analysis> => {
    const model = env("COSTERA_MODEL") || MAX_MODEL;
    const messages = [
      {
        role: "system",
        content:
          'You are a telecom support analyst reviewing a cluster of SYNTHETIC support tickets. Respond with ONLY a JSON object: {"summary": string, "likely_cause": string, "next_step": string, "caveats": string}. Ground every claim in the provided tickets and cite ticket IDs as evidence. State uncertainty explicitly. Never assert verified network truth.',
      },
      { role: "user", content: JSON.stringify({ cluster: cluster.title, tickets: cluster.tickets }) },
    ];
    let out: ChatOutcome;
    try {
      out = await chatCall(env, model, messages, 60000);
    } catch (e) {
      // one retry on transient reachability/timeout failures only
      if (e instanceof DecisionError && e.code === "tier2_unreachable") {
        out = await chatCall(env, model, messages, 60000);
      } else {
        throw e;
      }
    }
    let parsed: Record<string, unknown> | null = null;
    try {
      const candidate = JSON.parse(stripFences(out.content));
      if (typeof candidate === "object" && candidate !== null) parsed = candidate as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    const str = (k: string): string | null => (parsed && typeof parsed[k] === "string" ? (parsed[k] as string) : null);
    if (parsed && typeof parsed.summary === "string") {
      return {
        ...out,
        summary: parsed.summary,
        likelyCause: str("likely_cause"),
        nextStep: str("next_step"),
        caveats: str("caveats"),
      };
    }
    return {
      ...out,
      summary: out.content.trim(),
      likelyCause: null,
      nextStep: null,
      caveats: "Model returned unstructured text; treat as draft and verify.",
    };
  };
}