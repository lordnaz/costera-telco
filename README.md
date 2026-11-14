# COSTERA — Triage Desk

Kracked Devs bounty entry: **Build for Better Connectivity**.

A triage desk for a support agent at **ZephyrTel, a fictional telco**. It turns a batch of
scattered synthetic tickets into evidenced recurring patterns and a draft escalation brief,
routing each step to the cheapest lane that can do it — and handing off to a human when it
isn't sure.

**All data is synthetic.** Tickets, customers, plans and outages are generated from scratch.
Patterns are observations in synthetic data, not verified network truth. No real provider
names, branding, customer data or employer systems are used.

## Flow (M1 walking skeleton)

1. Agent loads the synthetic ticket batch (22 tickets).
2. Tier 1 classifier (`decision-model-preview`) classifies intent + complexity with probabilities.
3. Routing:
   - **Direct / code lane** — deterministic lookup against a synthetic knowledge base
     (plans, accounts, known outages, procedures). No generation call.
   - **Human review** — confidence below 70%, or anything touching credits/refunds.
   - **Tier 2 candidate** — complex with no deterministic answer (escalation itself is M2).
4. Output: recurring patterns with evidence (ticket IDs, quoted lines, counts, confidence),
   a per-ticket routing table, and a deterministically assembled draft escalation brief.

M2 adds the escalation lanes: Tier 2 light (`qwen3.8-flash`) writes plain-language summaries
for the escalation set (candidates + human review); Tier 2 heavy (`qwen3.8-max`) analyses
cross-ticket clusters **only when warranted** (high-volume, or containing unsure/candidate
tickets). Human-review handoffs carry the summaries and analysis. All Tier 2 output is
labelled model-generated in the UI, the brief and the run logs.

M3 adds a merged "Models & cost routing" section: one card per lane with its tier, model
name, role, and (after a run) calls/tokens/latency plus estimated cost. Below the cards, a
plain-language comparison shows routed cost vs an all-Max baseline as two bars, with the
savings percentage. Rates are fixed assumptions listed in a footnote; every figure is
labelled an estimate, not billing truth.

## Architecture

![COSTERA high-level solution architecture (M1–M3)](docs/architecture.png)

- Static React 19 + TypeScript + Vite + Tailwind frontend (`src/`), built to `dist/`.
- **Cloudflare Pages Functions** (`functions/api/[[path]].ts`) expose `/api/health`,
  `/api/batch`, `/api/triage`. The runtime-agnostic triage core lives in `server/`.
- API key and endpoint are read **server-side only** from encrypted Pages environment
  variables. They never appear in client code, this repo, or logs.
- No database: synthetic tickets and knowledge base are flat TypeScript modules.

## Configuration

| Name | Purpose |
| --- | --- |
| `COSTERA_API_KEY` | MaaS API key (server-side only) |
| `COSTERA_API_BASE_URL` | OpenAI-compatible base URL incl. `/compatible-mode/v1/` (server-side only) |

- Deployed: set both as **encrypted environment variables** in Cloudflare Pages settings.
  Without them the triage endpoint returns `service_not_configured` — it never fakes live results.
- Local: `.env` (Node fixture server) or `.dev.vars` (wrangler). Both are gitignored;
  copy `.env.example` and fill in values yourself. Never commit or paste real values.

The decision-model **response** parsing follows the verified shape (`answers.<field>.choice /
.confidence / .probabilities`). The request contract is owner-verified: `POST {base}/systemone`
with `{ model, state, questions }` (choice-type questions in M1), built in
`server/decision.ts → buildDecisionRequest()`. Flash/max use `{base}/chat/completions`.

## Local development

```sh
npm ci
node dev/node-function-local.mjs   # fixture Function server on 127.0.0.1:8000 (dev only)
npm run dev                        # Vite on 127.0.0.1:5173, proxies /api
```

Fixture mode simulates Tier 1 responses and is clearly labelled in the UI. The fixture
classifier lives in `dev/` and is never deployed.

Real Workers runtime check (needs `npm run build` first; secrets via `.dev.vars` if present):

```sh
npm run dev:cf                     # wrangler pages dev on 127.0.0.1:8001
```

Live local test against the real API (create `.env` yourself first; never commit it):

```sh
node --env-file=.env dev/probe-contract.mjs    # one-off request-contract discovery
node --env-file=.env dev/node-live-local.mjs   # real Tier 1 on :8000 (stop fixture server first)
```

Checks:

```sh
node dev/node-check.mjs            # credential-free handler checks (Node)
npm run build                      # type-check + static build
```

## Run logs

Every triage run produces an audit record: run ID, timestamp, mode, stats, and a per-ticket
trace with the exact request body sent to the decision model and its raw response, plus the
routing outcome. Logs never contain headers, the API key, or the endpoint hostname.

- Local dev servers write one pretty JSON file per run to `logs/` (gitignored).
- Deployed Pages Functions emit one structured JSON line per run to the console
  (visible in Cloudflare Pages logs).
- `POST /api/triage` with `{"includeTrace": true}` also returns the trace in the response.

## Deployment

GitHub repo → **Cloudflare Pages auto-deploy**. Build command `npm run build`, output
directory `dist`. Pages serves the static frontend and the Functions at `/api/*`, and
provides a public `*.pages.dev` URL. Starter attribution: `PROVENANCE.md`.