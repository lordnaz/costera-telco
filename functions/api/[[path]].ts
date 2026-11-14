// Cloudflare Pages Functions catch-all for /api/*.
// Secrets come from encrypted Pages environment variables (context.env), server-side only.
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
    const value = context.env[name];
    return typeof value === "string" ? value : undefined;
  };
  return createHandler(env, { sink: (record) => console.log(JSON.stringify(record)) })(context.request);
}