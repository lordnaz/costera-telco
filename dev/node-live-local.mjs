// DEV-ONLY live local server: real Tier 1 classifier, secrets from process.env.
// Run: node --env-file=.env dev/node-live-local.mjs
// Create .env yourself from .env.example; never commit it, never paste values in chat.
// Stop the fixture server (dev/node-function-local.mjs) first — both use port 8000.
import { createServer } from "node:http";
import { createHandler } from "../server/handler.ts";

const env = (name) => process.env[name];
const handler = createHandler(env);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:8000");
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await readBody(req) : undefined;
    const request = new Request(url, { method: req.method, headers, body });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "dev_server_error" }));
  }
});

server.listen(8000, "127.0.0.1", () => {
  console.log("LIVE local Function server on http://127.0.0.1:8000 (secrets from .env)");
});