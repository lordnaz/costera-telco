// Cloudflare Pages Functions catch-all for /api/*.
// Secrets come from encrypted Pages environment variables (context.env), server-side only.
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
  return createHandler(env)(context.request);
}