// Triage HTTP handler. Runtime-agnostic core: deployed via Cloudflare Pages Functions
// (functions/api/[[path]].ts), exercised locally by dev/ servers and checks.
// Secrets are read server-side only through EnvReader. Never log or return them.
// Unknown paths return 404; GET never mutates; errors are stable codes, never raw upstream text.
// Run logs: an optional sink receives { runId, at, mode, stats, trace } per triage run,
// where trace holds each Tier 1 / Tier 2 request body and raw model response. Sinks must
// never write headers, the API key, or the endpoint hostname. Logging failures never break triage.

import { BATCH_LABEL, TELCO, TICKETS } from "./data.ts";
import { createDecisionClassifier } from "./decision.ts";
import type { ClassifyFn, EnvReader } from "./decision.ts";
import { createFlashSummarizer, createMaxAnalyzer } from "./tier2.ts";
import { runTriage } from "./triage.ts";
import type { Tier2Deps, TraceEntry, TriageStats } from "./triage.ts";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}

export interface RunLog {
  runId: string;
  at: string;
  mode: "live" | "fixture";
  stats: TriageStats;
  trace: TraceEntry[];
}

export type RunLogSink = (record: RunLog) => void | Promise<void>;

export interface HandlerOpts {
  classify?: ClassifyFn;
  sink?: RunLogSink;
  tier2?: Tier2Deps;
}

export function createHandler(env: EnvReader, opts: HandlerOpts = {}) {
  const fixtureClassify = opts.classify;
  const sink = opts.sink;
  const mode: "live" | "fixture" = fixtureClassify ? "fixture" : "live";
  const configured = () => Boolean(env("COSTERA_API_KEY") && env("COSTERA_API_BASE_URL"));

  return async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const route = segments[segments.length - 1] ?? "";

    if (route === "health") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      return json({ ok: true, service: "costera-triage", mode, configured: configured() });
    }

    if (route === "batch") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      return json({
        ok: true,
        telco: `${TELCO} (fictional)`,
        synthetic: true,
        batchLabel: BATCH_LABEL,
        tickets: TICKETS,
      });
    }

    if (route === "triage") {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      if (!fixtureClassify && !configured()) {
        return json(
          {
            ok: false,
            error: "service_not_configured",
            message: "Server secrets are not set. The site owner must enter COSTERA_API_KEY and COSTERA_API_BASE_URL in the hosting environment settings.",
          },
          503,
        );
      }
      let ticketIds: string[] | undefined;
      let includeTrace = false;
      let raw: string;
      try {
        raw = await request.text();
      } catch {
        return json({ ok: false, error: "invalid_body" }, 400);
      }
      if (raw.length > 10000) return json({ ok: false, error: "invalid_body" }, 400);
      if (raw.trim().length > 0) {
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: "invalid_body" }, 400);
        }
        if (typeof body === "object" && body !== null) {
          const obj = body as Record<string, unknown>;
          includeTrace = obj.includeTrace === true;
          if ("ticketIds" in obj) {
            const ids = obj.ticketIds;
            if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || ids.some((x) => typeof x !== "string")) {
              return json({ ok: false, error: "invalid_ticket_ids" }, 400);
            }
            const known = new Set(TICKETS.map((t) => t.id));
            if (ids.some((x) => !known.has(x as string))) {
              return json({ ok: false, error: "unknown_ticket_id" }, 400);
            }
            ticketIds = ids as string[];
          }
        }
      }
      const classify = fixtureClassify ?? createDecisionClassifier(env);
      const tier2 =
        opts.tier2 ??
        (configured() ? { summarize: createFlashSummarizer(env), analyze: createMaxAnalyzer(env) } : undefined);
      try {
        const result = await runTriage(classify, ticketIds, mode, tier2);
        if (sink) {
          const record: RunLog = {
            runId: crypto.randomUUID(),
            at: new Date().toISOString(),
            mode,
            stats: result.stats,
            trace: result.trace,
          };
          try {
            await sink(record);
          } catch {
            // logging must never break triage
          }
        }
        if (includeTrace) return json(result);
        const { trace, ...rest } = result;
        return json(rest);
      } catch {
        return json({ ok: false, error: "triage_failed", message: "Triage could not complete." }, 500);
      }
    }

    return json({ ok: false, error: "not_found" }, 404);
  };
}