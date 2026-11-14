// DEV-ONLY fixture Tier 2 lanes so the full M2 flow runs without credentials.
// Never deployed. Shapes mirror the verified chat-completions contract.
import { FLASH_MODEL, MAX_MODEL } from "../server/tier2.ts";
import type { AnalyzeFn, SummarizeFn } from "../server/tier2.ts";

const SUMMARIES: Record<string, string> = {
  "ZT-1002": "Customer changed to Streamline 60 last week and received a bill above the advertised $60; asks why.",
  "ZT-1005": "Customer reports two charges in one month after moving to Streamline 60: a full bill plus a partial one.",
  "ZT-1008": "Customer's first Streamline 60 bill includes an unexplained one-off fee despite the $60 flat advertising.",
  "ZT-1010": "Customer asks whether the Hillcrest outage is resolved; data returned yesterday but wants confirmation.",
  "ZT-1011": "Customer sees an extra $40 adjustment after upgrading to Streamline 60 and asks for an explanation.",
  "ZT-1015": "Customer reports unspecified dissatisfaction with no detail; intent unclear.",
  "ZT-1017": "Customer demands a refund for an extra charge they say they never agreed to.",
  "ZT-1018": "Customer in Riverside lost all data after the storm; calls and SMS still work.",
  "ZT-1019": "Customer's SIM failed after water damage; asks how to obtain a replacement.",
  "ZT-1020": "Customer references an unresolved issue from last week without specifics; second contact.",
  "ZT-1021": "Customer requests account credit for downtime days in Riverside.",
};

export const fixtureSummarize: SummarizeFn = async (ticket) => {
  const text = SUMMARIES[ticket.id] ?? `Customer reports: ${ticket.text.slice(0, 120)}`;
  const request = {
    model: FLASH_MODEL,
    messages: [
      { role: "system", content: "You summarise telecom support tickets for a support agent." },
      { role: "user", content: ticket.text },
    ],
  };
  return {
    text,
    request,
    raw: {
      model: FLASH_MODEL,
      choices: [{ message: { role: "assistant", content: text } }],
      usage: { prompt_tokens: 90, completion_tokens: 40, total_tokens: 130 },
    },
    inputTokens: 90,
    outputTokens: 40,
    latencyMs: 180,
  };
};

export const fixtureAnalyze: AnalyzeFn = async (cluster) => {
  const ids = cluster.tickets.map((t) => t.id).join(", ");
  const summary = `Fixture analysis of ${cluster.title}: ${cluster.tickets.length} tickets (${ids}) share a common trigger; pattern observed in synthetic data only.`;
  const request = {
    model: MAX_MODEL,
    messages: [
      { role: "system", content: "You are a telecom support analyst reviewing a cluster of SYNTHETIC support tickets." },
      { role: "user", content: JSON.stringify({ cluster: cluster.title, tickets: cluster.tickets }) },
    ],
  };
  const content = JSON.stringify({
    summary,
    likely_cause: "Fixture: shared trigger across the cluster (synthetic).",
    next_step: "Fixture: verify with the owning team before customer communication.",
    caveats: "Fixture analysis — not a live model output.",
  });
  return {
    summary,
    likelyCause: "Fixture: shared trigger across the cluster (synthetic).",
    nextStep: "Fixture: verify with the owning team before customer communication.",
    caveats: "Fixture analysis — not a live model output.",
    request,
    raw: {
      model: MAX_MODEL,
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 },
    },
    inputTokens: 400,
    outputTokens: 120,
    latencyMs: 900,
  };
};