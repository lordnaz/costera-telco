// Bring-your-own session credentials. Reviewers may supply their own API key and
// endpoint per tier at runtime; values live only for the request that carries them.
// They are never stored, never logged, never echoed back, and never fall back to the
// owner's environment key once a session key is present (public deployments stay off
// the owner's bill). Session endpoints must be public HTTPS URLs (SSRF guard).
// The owner's environment key is reachable ONLY through the explicit, temporary
// reviewer opt-in (demoAccess flag + consent in the UI); it is retired after the
// bounty review. Without that flag the environment is never consulted.

import type { EnvReader } from "./decision.ts";

export type TierId = "decision" | "flash" | "max";
export const TIER_IDS: TierId[] = ["decision", "flash", "max"];

export interface TierCredentials {
  key: string;
  baseUrl: string;
  model: string;
}

export interface SessionCredentials {
  baseUrl: string;
  key: string;
  decisionEngine: "systemone" | "chat";
  tiers: Record<TierId, TierCredentials>;
}

export class CredentialsError extends Error {
  code = "invalid_credentials";
  constructor(message: string) {
    super(message);
  }
}

export class ReviewerAccessError extends Error {
  code = "reviewer_access_unavailable";
  constructor(message: string) {
    super(message);
  }
}

const MAX_LEN = 512;

function str(v: unknown, field: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.length > MAX_LEN) {
    throw new CredentialsError(`Credential field "${field}" must be a string of at most ${MAX_LEN} characters.`);
  }
  return v.trim();
}

// Public HTTPS only: no loopback, link-local, private ranges or internal hostnames,
// so a supplied endpoint cannot be used to probe the hosting network.
export function assertPublicHttpsUrl(base: string): void {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new CredentialsError("Endpoint must be a valid URL.");
  }
  if (u.protocol !== "https:") throw new CredentialsError("Endpoint must use HTTPS.");
  if (u.port !== "" && u.port !== "443") throw new CredentialsError("Endpoint must use the default HTTPS port.");
  const h = u.hostname.toLowerCase();
  const blocked =
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h === "::1";
  if (blocked) throw new CredentialsError("Endpoint must be a public host.");
}

export function parseSessionCredentials(raw: unknown): SessionCredentials | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") throw new CredentialsError("Credentials must be an object.");
  const obj = raw as Record<string, unknown>;
  const tiersRaw = (obj.tiers ?? {}) as Record<string, unknown>;
  if (typeof tiersRaw !== "object" || tiersRaw === null) throw new CredentialsError("Credential tiers must be an object.");
  const tiers = {} as Record<TierId, TierCredentials>;
  for (const t of TIER_IDS) {
    const entry = (tiersRaw[t] ?? {}) as Record<string, unknown>;
    if (typeof entry !== "object" || entry === null) throw new CredentialsError(`Credential tier "${t}" must be an object.`);
    const model = str(entry.model, `${t}.model`);
    if (model.length > 128) throw new CredentialsError(`Credential field "${t}.model" must be at most 128 characters.`);
    tiers[t] = { key: str(entry.key, `${t}.key`), baseUrl: str(entry.baseUrl, `${t}.baseUrl`), model };
  }
  const engineRaw = obj.decisionEngine ?? "systemone";
  if (engineRaw !== "systemone" && engineRaw !== "chat") {
    throw new CredentialsError('decisionEngine must be "systemone" or "chat".');
  }
  const parsed: SessionCredentials = {
    baseUrl: str(obj.baseUrl, "baseUrl"),
    key: str(obj.key, "key"),
    decisionEngine: engineRaw,
    tiers,
  };
  const urls = [parsed.baseUrl, ...TIER_IDS.map((t) => parsed.tiers[t].baseUrl)].filter((u) => u.length > 0);
  for (const u of urls) assertPublicHttpsUrl(u);
  return parsed;
}

export function sessionActive(s: SessionCredentials | null): boolean {
  if (!s) return false;
  return s.key.length > 0 || TIER_IDS.some((t) => s.tiers[t].key.length > 0);
}

// Session values win per tier (override, then shared). Without the explicit demo opt-in
// the owner's environment key is NEVER used, even when no session key is present.
// With demoAccess=true the environment supplies key+endpoint for every tier (the browser
// never sees them); session-supplied secrets are ignored so they cannot overwrite the env.
export function effectiveCredentials(
  s: SessionCredentials | null,
  env: EnvReader,
  demoAccess = false,
): { tiers: Record<TierId, TierCredentials>; decisionEngine: "systemone" | "chat" } {
  const tiers = {} as Record<TierId, TierCredentials>;
  if (demoAccess) {
    const key = env("COSTERA_API_KEY") ?? "";
    const baseUrl = env("COSTERA_API_BASE_URL") ?? "";
    if (!key || !baseUrl) {
      throw new ReviewerAccessError("Temporary reviewer access is not enabled on this deployment.");
    }
    assertPublicHttpsUrl(baseUrl);
    for (const t of TIER_IDS) {
      tiers[t] = {
        key,
        baseUrl,
        model: s?.tiers[t].model || env(`COSTERA_MODEL_${t.toUpperCase()}`) || "",
      };
    }
    const engine = s?.decisionEngine ?? (env("COSTERA_DECISION_ENGINE") === "chat" ? "chat" : "systemone");
    return { tiers, decisionEngine: engine };
  }
  const active = sessionActive(s);
  for (const t of TIER_IDS) {
    tiers[t] =
      active && s
        ? {
            key: s.tiers[t].key || s.key,
            baseUrl: s.tiers[t].baseUrl || s.baseUrl,
            model: s.tiers[t].model,
          }
        : { key: "", baseUrl: "", model: "" };
  }
  const decisionEngine = active && s ? s.decisionEngine : "systemone";
  return { tiers, decisionEngine };
}

export function tierEnvReader(
  creds: TierCredentials,
  engine: "systemone" | "chat",
  fallback: EnvReader,
): EnvReader {
  return (name: string) => {
    if (name === "COSTERA_API_KEY") return creds.key || undefined;
    if (name === "COSTERA_API_BASE_URL") return creds.baseUrl || undefined;
    if (name === "COSTERA_MODEL") return creds.model || undefined;
    if (name === "COSTERA_DECISION_ENGINE") return engine;
    return fallback(name);
  };
}