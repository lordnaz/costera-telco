// Cloudflare Pages Functions catch-all for /api/*.
// Session keys only by default: every request carries the reviewer's own API credentials,
// entered in Settings, held in memory and used for that request alone. Pages environment
// variables are read ONLY for the explicit temporary reviewer opt-in (demoAccess flag,
// consented in the UI); without it a deployment can never spend an owner key. The env key
// and endpoint are never returned to the browser. Retire the vars after the bounty review.
// Run logs go to console as one structured JSON line per triage run (visible in Pages logs).
// The log record contains request bodies and raw model responses only — never headers,
// the API key, or the endpoint hostname.
import { createHandler } from "../../server/handler.ts";

interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const env = (name: string): string | undefined => {
    const v = context.env[name];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  return createHandler(env, { sink: (record) => console.log(JSON.stringify(record)) })(context.request);
}