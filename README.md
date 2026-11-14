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
2. Tier 1 (`decision-model-preview`) classifies intent + complexity with probabilities.
3. Routing:
   - **Direct / code lane** — deterministic lookup against a synthetic knowledge base
     (plans, accounts, known outages, procedures). No generation call.
   - **Human review** — confidence below 70%, or anything touching credits/refunds.
   - **Tier 2 candidate** — complex with no deterministic answer (escalation itself is M2).
4. Output: recurring patterns with evidence (ticket IDs, quoted lines, counts, confidence),
   a per-ticket routing table, and a deterministically assembled draft escalation brief.

## Architecture

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
.confidence / .probabilities`). The **request** contract is isolated in
`server/decision.ts → buildDecisionRequest()` and is pending owner verification.

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

Checks:

```sh
node dev/node-check.mjs            # credential-free handler checks (Node)
npm run build                      # type-check + static build
```

## Deployment

GitHub repo → **Cloudflare Pages auto-deploy**. Build command `npm run build`, output
directory `dist`. Pages serves the static frontend and the Functions at `/api/*`, and
provides a public `*.pages.dev` URL. Starter attribution: `PROVENANCE.md`.