// DEV-ONLY one-off probe: discover the decision-model-preview request BODY for the
// owner-verified path {base}/systemone. Tries up to three body shapes with ONE ticket
// each, stops at the first response carrying the verified `answers` shape. Then makes
// one flash call to confirm the standard chat-completions shape for M2.
// Logs status + shape only — never the API key, never the endpoint hostname.
// Run: node --env-file=.env dev/probe-contract.mjs
import { TICKETS } from "../server/data.ts";

const key = process.env.COSTERA_API_KEY;
const base = process.env.COSTERA_API_BASE_URL;
if (!key || !base) {
  console.error("Missing values. Fill COSTERA_API_KEY in .env yourself first.");
  process.exit(1);
}
const href = base.endsWith("/") ? base : base + "/";
const ticket = TICKETS[0];
const INTENTS = ["billing", "technical", "account", "roaming", "other"];

const candidates = [
  {
    name: "systemone + messages",
    path: "systemone",
    body: {
      model: "decision-model-preview",
      messages: [
        {
          role: "system",
          content:
            "Classify this telecom support ticket. Return intent (billing, technical, account, roaming, other) and complexity (routine, complex).",
        },
        { role: "user", content: ticket.text },
      ],
    },
  },
  {
    name: "systemone + input/schema",
    path: "systemone",
    body: {
      model: "decision-model-preview",
      input: ticket.text,
      schema: {
        intent: { type: "choice", choices: INTENTS },
        complexity: { type: "choice", choices: ["routine", "complex"] },
      },
    },
  },
  {
    name: "systemone + input plain",
    path: "systemone",
    body: { model: "decision-model-preview", input: ticket.text },
  },
];

async function post(path, body) {
  const res = await fetch(new URL(path, href), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON
  }
  return { status: res.status, parsed };
}

let found = false;
for (const c of candidates) {
  try {
    const { status, parsed } = await post(c.path, c.body);
    const keys = parsed ? Object.keys(parsed) : [];
    const hasAnswers = parsed && typeof parsed.answers === "object" && parsed.answers !== null;
    console.log(`${c.name}: HTTP ${status} | keys: ${keys.join(", ") || "(non-JSON)"} | answers: ${Boolean(hasAnswers)}`);
    if (hasAnswers) {
      console.log(`CONTRACT FOUND: ${c.name}`);
      console.log(JSON.stringify(parsed, null, 1).slice(0, 1200));
      found = true;
      break;
    }
  } catch (e) {
    console.log(`${c.name}: network error (${e.name})`);
  }
}
if (!found) {
  console.log("No body shape returned the verified answers shape. A sanitized Insomnia request example is needed.");
}

// M2 prep: confirm flash uses the standard chat-completions response shape.
try {
  const { status, parsed } = await post("chat/completions", {
    model: "qwen3.8-flash",
    messages: [{ role: "user", content: "Reply with the single word: OK" }],
  });
  const keys = parsed ? Object.keys(parsed) : [];
  const hasChoices = parsed && Array.isArray(parsed.choices);
  console.log(`flash chat/completions: HTTP ${status} | keys: ${keys.join(", ") || "(non-JSON)"} | choices: ${Boolean(hasChoices)}`);
} catch (e) {
  console.log(`flash chat/completions: network error (${e.name})`);
}