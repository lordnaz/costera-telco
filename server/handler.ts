// Triage HTTP handler. Runtime-agnostic core: deployed via Cloudflare Pages Functions
// (functions/api/[[path]].ts), exercised locally by dev/ servers and checks.
// Secrets are read server-side only through EnvReader. Never log or return them.
// Unknown paths return 404; GET never mutates; errors are stable codes, never raw upstream text.
// Run logs: an optional sink receives { runId, at, mode, stats, trace } per triage run,
// where trace holds each Tier 1 / Tier 2 request body and raw model response. Sinks must
// never write headers, the API key, or the endpoint hostname. Logging failures never break triage.

import { BATCH_LABEL, TELCO, TICKETS } from "./data.ts";
import {
  CredentialsError,
  ReviewerAccessError,
  effectiveCredentials,
  parseSessionCredentials,
  sessionActive,
  tierEnvReader,
} from "./credentials.ts";
import type { SessionCredentials, TierId } from "./credentials.ts";
import { createDecisionClassifier, CHAT_CLASSIFIER_MODEL, DECISION_MODEL } from "./decision.ts";
import type { ClassifyFn, EnvReader } from "./decision.ts";
import { modelsEndpoint } from "./endpoints.ts";
import { isPresetId, presetInfo, PRESET_SETUP } from "./presets.ts";
import type { PresetId } from "./presets.ts";
import { createFlashSummarizer, createMaxAnalyzer, FLASH_MODEL, MAX_MODEL } from "./tier2.ts";
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
  keySource: "env" | "session";
  decisionEngine: "systemone" | "chat";
  models: { decision: string; flash: string; max: string };
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

    if (route === "demo-access") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      // Availability + model names only. The key and endpoint hostname never leave the server.
      return json({ ok: true, ...presetInfo(env, "qwen"), ilmu: presetInfo(env, "ilmu") });
    }

    if (route === "triage") {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      let ticketIds: string[] | undefined;
      let includeTrace = false;
      let demoAccess = false;
      let demoProvider: PresetId = "qwen";
      let session: SessionCredentials | null = null;
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
          demoAccess = obj.demoAccess === true;
          if (isPresetId(obj.demoProvider)) demoProvider = obj.demoProvider;
          try {
            session = parseSessionCredentials(obj.credentials);
          } catch (e) {
            // credential values are never echoed or logged
            return json(
              { ok: false, error: "invalid_credentials", message: e instanceof CredentialsError ? e.message : "Invalid credentials." },
              400,
            );
          }
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
      const byo = sessionActive(session);
      if (!fixtureClassify && !byo && !demoAccess) {
        return json(
          {
            ok: false,
            error: "service_not_configured",
            message:
              "No API access configured. Supply your own session API key, endpoint and model per tier in Settings (memory-only, cleared on refresh), then press Test on each tier — or enable the temporary reviewer access offered there.",
          },
          503,
        );
      }
      if (!fixtureClassify && demoAccess && !presetInfo(env, demoProvider).available) {
        return json(
          {
            ok: false,
            error: "reviewer_access_unavailable",
            message: "Temporary reviewer access is not enabled on this deployment. Add your own API access in Settings.",
          },
          503,
        );
      }
      let eff: ReturnType<typeof effectiveCredentials>;
      try {
        eff = effectiveCredentials(session, env, demoAccess, demoProvider);
      } catch (e) {
        if (e instanceof ReviewerAccessError) return json({ ok: false, error: e.code, message: e.message }, 503);
        return json(
          { ok: false, error: "invalid_credentials", message: e instanceof CredentialsError ? e.message : "Invalid credentials." },
          400,
        );
      }
      const reader = (t: TierId) => tierEnvReader(eff.tiers[t], eff.decisionEngine, env);
      const classify = fixtureClassify ?? createDecisionClassifier(reader("decision"));
      const tier2: Tier2Deps =
        opts.tier2 ?? { summarize: createFlashSummarizer(reader("flash")), analyze: createMaxAnalyzer(reader("max")) };
      try {
        const result = await runTriage(classify, ticketIds, mode, tier2);
        result.keySource = byo ? "session" : "env";
        result.decisionEngine = eff.decisionEngine;
        result.models = {
          decision: eff.tiers.decision.model || (eff.decisionEngine === "chat" ? CHAT_CLASSIFIER_MODEL : DECISION_MODEL),
          flash: eff.tiers.flash.model || FLASH_MODEL,
          max: eff.tiers.max.model || MAX_MODEL,
        };
        if (sink) {
          const record: RunLog = {
            runId: crypto.randomUUID(),
            at: new Date().toISOString(),
            mode,
            keySource: result.keySource,
            decisionEngine: result.decisionEngine,
            models: result.models,
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

    if (route === "credentials") {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid_body" }, 400);
      }
      if (typeof body !== "object" || body === null) return json({ ok: false, error: "invalid_body" }, 400);
      const obj = body as Record<string, unknown>;
      const tier = obj.tier;
      if (tier !== "decision" && tier !== "flash" && tier !== "max") {
        return json({ ok: false, error: "invalid_credentials", message: "Provide tier, key and baseUrl." }, 400);
      }
      let key: string;
      let baseUrl: string;
      if (obj.demo === true) {
        // Temporary reviewer opt-in: test the selected preset's server-side env access
        // without ever sending the key or endpoint to the browser.
        const setup = PRESET_SETUP[isPresetId(obj.demoProvider) ? obj.demoProvider : "qwen"];
        const k = env(setup.keyVar);
        const u = env(setup.baseVar);
        if (!k || !u) {
          return json(
            { ok: false, error: "reviewer_access_unavailable", message: "Temporary reviewer access is not enabled on this deployment." },
            200,
          );
        }
        key = k;
        baseUrl = u;
      } else {
        const k = obj.key;
        const u = obj.baseUrl;
        if (typeof k !== "string" || k.trim().length === 0 || k.length > 512 || typeof u !== "string") {
          return json({ ok: false, error: "invalid_credentials", message: "Provide tier, key and baseUrl." }, 400);
        }
        key = k;
        baseUrl = u;
      }
      try {
        // reuse the same public-HTTPS guard as triage credentials
        parseSessionCredentials({ tiers: { [tier]: { key, baseUrl } } });
      } catch (e) {
        return json(
          { ok: false, error: "invalid_credentials", message: e instanceof CredentialsError ? e.message : "Invalid credentials." },
          400,
        );
      }
      try {
        const res = await fetch(modelsEndpoint(baseUrl), {
          headers: { Authorization: `Bearer ${key.trim()}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return json({ ok: false, error: "credentials_rejected", message: `Endpoint returned HTTP ${res.status}.` }, 200);
        }
        let count: number | null = null;
        try {
          const j = (await res.json()) as { data?: unknown[] };
          if (Array.isArray(j.data)) count = j.data.length;
        } catch {
          // model list shape is optional; HTTP 200 already proves access
        }
        return json({ ok: true, models: count });
      } catch {
        return json({ ok: false, error: "credentials_unreachable", message: "Endpoint could not be reached." }, 200);
      }
    }

    return json({ ok: false, error: "not_found" }, 404);
  };
}