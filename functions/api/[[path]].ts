// Cloudflare Pages Functions catch-all for /api/*.
// Session keys only: every request carries the reviewer's own API credentials, entered in
// Settings, held in memory and used for that request alone. This entry point deliberately
// reads NO Pages environment variables, so a deployment can never spend an owner key.
// Run logs go to console as one structured JSON line per triage run (visible in Pages logs).
// The log record contains request bodies and raw model responses only — never headers,
// the API key, or the endpoint hostname.
import { createHandler } from "../../server/handler.ts";

interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const env = (): string | undefined => undefined;
  return createHandler(env, { sink: (record) => console.log(JSON.stringify(record)) })(context.request);
}