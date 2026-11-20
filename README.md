# COSTERA — Triage Desk

Kracked Devs bounty entry: **Build for Better Connectivity** — built by
[@nazlamp](https://krackeddevs.com/profile/nazlamp).

A triage desk for a support agent at **ZephyrTel, a fictional telco**. It reads a batch of
scattered tickets, routes each one to the cheapest lane that can handle it, and hands off to a
human when it isn't sure — leaving an agent with evidenced patterns and a draft escalation brief.

![COSTERA solution architecture (M1–M3)](docs/architecture.png)

**All data is synthetic** — tickets, customers, plans and outages are generated from scratch.
Patterns are observations in synthetic data, not verified network truth. Provider and model names
appear only as options for your own API access.

## How it works

1. **Tier 1 classifies** intent and complexity for all 22 tickets.
2. **A policy routes** each ticket to the cheapest capable lane:
   - **Direct / code lane** — deterministic lookup in a synthetic knowledge base, no tokens spent.
   - **Human review** — confidence below 70%, or anything touching credits and refunds.
   - **Tier 2** — `flash` summarises the escalation set; `max` reads a cluster only when warranted.
3. **Output** — recurring patterns with ticket IDs, quoted lines, counts and confidence, a
   deterministic draft brief, and an estimated cost of the run.

Tier 2 results are labelled model-generated, and cost figures are estimates from assumed
per-model rates — never billing truth.

## Try it

1. Open the site — it lands on **Overview**. **How it works** (bottom of the sidebar) explains the
   routing and repeats the diagram.
2. **Settings → Bring your own API access**: paste your key and OpenAI-compatible base URL, pick a
   model per tier (the starred Recommended trios are verified end-to-end), then **Test** each tier.
3. **Run triage** on Overview. Patterns, brief and cost analytics fill in.

Starred as recommended: **Tier 1** `decision-model-preview` (or `jeff`), **Tier 2 light**
`qwen3.8-flash`, **Tier 2 heavy** `qwen3.8-max`. Any OpenAI-compatible provider or model ID works,
but only the starred trios are verified end-to-end: the Qwen trio above and the ILMU family
(`ilmu-mini-v3.3`, `ilmu-glm-5.3-flash`, `ilmu-glm-5.3`) — both tested live across classify, route,
escalate, brief and cost readout.

## Model access

- **Session keys by default.** Entered in Settings, held in memory, used server-side for that one
  request — never stored, logged or written to browser storage. A refresh clears them.
- **Temporary reviewer access (optional).** Reviewers without a key can opt in from Settings after
  a consent notice; the server then uses its own pre-setup env (`COSTERA_API_KEY`,
  `COSTERA_API_BASE_URL`, optional `COSTERA_MODEL_*`). The key and endpoint never reach the browser
  and cannot be edited in that mode; all three tiers must pass Test before a run. The owner retires
  the env after the bounty review — afterwards only session keys work. Without the opt-in flag the
  env is never consulted.
- **ILMU reviewer preset (optional).** A second consent button in Settings borrows a separate
  server-side pre-setup (`COSTERA_ILMU_API_KEY`, `COSTERA_ILMU_API_BASE_URL`, optional
  `COSTERA_ILMU_MODEL_*`), pre-filled with `ilmu-mini-v3.3` (Tier 1, chat engine),
  `ilmu-glm-5.3-flash` (Tier 2 light) and `ilmu-glm-5.3` (Tier 2 heavy). Same hidden-key rules as
  the Qwen preset; the two presets never borrow each other's env. The button appears only when
  the ILMU env pair is configured.
- **Nothing is persisted.** There is no database, so reloading resets the desk and the setup;
  run logs are the durable audit trail. Endpoints must be public HTTPS; loopback and private hosts
  are rejected.

## Layout

- `src/` React 19 + TypeScript + Vite + Tailwind frontend, built to `dist/`.
- `server/` runtime-agnostic triage core; `functions/api/[[path]].ts` exposes `/api/*`.
- `dev/` fixture server, live server and checks — never deployed.

## Local development

```sh
npm ci
node dev/node-function-local.mjs   # fixture server on 127.0.0.1:8000
npm run dev                        # Vite on 127.0.0.1:5173, proxies /api
```

Real model calls, same code path as production — key goes in Settings, not in a file:

```sh
node dev/node-live-local.mjs       # live Tier 1/2 on :8000 (stop the fixture server first)
```

Checks:

```sh
node dev/node-check.mjs            # credential-free handler checks
npm run build                      # type-check + static build
```

Each run also writes an audit record — per-ticket request and response for every lane, plus stats
and routing outcome — to `logs/` locally, or the server console when deployed. Logs never contain
headers, the API key or the endpoint hostname.

## Deployment (Cloudflare Pages)

Build command `npm run build`, output directory `dist/`. The Functions read their pre-setup from
the Pages project environment, never from the repo: under **Settings → Environment variables**
set `COSTERA_API_KEY` / `COSTERA_API_BASE_URL` (Qwen preset) and `COSTERA_ILMU_API_KEY` /
`COSTERA_ILMU_API_BASE_URL` (ILMU preset) — keys as encrypted secrets, base URLs as plain text —
then trigger a new deployment so the values take effect. A preset button only appears when its
env pair is present. `.env` and `.dev.vars` are gitignored and never deployed.

Starter attribution: `PROVENANCE.md`.
