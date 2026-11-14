// DEV-ONLY local Function server (Node, no Deno required) with the fixture classifier.
// Vite proxies /functions/v1/app here. Never deployed; lives outside dist/ and functions/.
import { createServer } from "node:http";
import { createHandler } from "../server/handler.ts";
import { fixtureClassify } from "./fixtures.ts";

const env = (name) => process.env[name];
const handler = createHandler(env, fixtureClassify);

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
  console.log("Fixture Function server listening on http://127.0.0.1:8000");
});