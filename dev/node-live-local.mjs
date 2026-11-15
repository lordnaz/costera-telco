// DEV-ONLY live local server: real Tier 1/2 clients, session credentials by default.
// Optionally loads .env (gitignored) for the temporary reviewer opt-in: the env key is
// used ONLY when a request carries demoAccess=true after UI consent, and is never sent
// to the browser. Without .env, or without the flag, Settings session keys are the only
// way to reach real models. Stop the fixture server (dev/node-function-local.mjs) first
// — both use port 8000.
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHandler } from "../server/handler.ts";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // no .env present — bring-your-own session keys only
}
const env = (name) => process.env[name];
const sink = (record) => {
  mkdirSync("logs", { recursive: true });
  const file = `logs/triage-${record.at.replace(/[:.]/g, "-")}-${record.runId.slice(0, 8)}.json`;
  writeFileSync(file, JSON.stringify(record, null, 2));
  console.log("triage run logged:", file);
};
const handler = createHandler(env, { sink });

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
  console.log(
    process.env.COSTERA_API_KEY
      ? "LIVE local Function server on http://127.0.0.1:8000 (temporary reviewer access available; BYO session keys otherwise)"
      : "LIVE local Function server on http://127.0.0.1:8000 (no env secrets — configure access in Settings)",
  );
});