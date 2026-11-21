import architectureUrl from "@/docs/architecture.png";
import stepByStepUrl from "@/docs/step-by-step.png";
import whatItIsForUrl from "@/docs/what-it-is-for.png";
import { ArrowRight, Expand, Layers, ScanSearch, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Desk } from "../components/bits";
import { InfoNote, SectionCard } from "../components/bits";

const PRINCIPLES: { icon: typeof Sparkles; title: string; body: string }[] = [
  {
    icon: Sparkles,
    title: "Cheapest capable lane",
    body: "A deterministic lookup costs nothing. A small classifier reads every ticket. The expensive model only sees clusters that need cross-ticket judgement.",
  },
  {
    icon: ShieldCheck,
    title: "Never sure, never silent",
    body: "Low confidence or money touching a customer raises a hand for review, with the model's reasoning and the raw evidence attached.",
  },
  {
    icon: ScanSearch,
    title: "Evidence over opinion",
    body: "Every pattern links back to the tickets and quoted lines behind it, so an agent can check the claim instead of trusting it.",
  },
  {
    icon: Layers,
    title: "Auditable by default",
    body: "Each run records the exact request sent and the raw response received, per ticket and per lane — enough to replay why the desk said what it said.",
  },
];

export function HowItWorks({ desk }: { desk: Desk }) {
  return (
    <div className="space-y-5">
      <SectionCard
        title="What this is"
        sub="Kracked Devs bounty entry · Build for Better Connectivity — built by @nazlamp"
        action={
          <a href={whatItIsForUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">
              <Expand /> Open full size
            </Button>
          </a>
        }
      >
        <a
          href={whatItIsForUrl}
          target="_blank"
          rel="noreferrer"
          title="Open full size in a new tab"
          className="block w-full overflow-hidden rounded-lg border bg-white p-2 transition-shadow hover:shadow-md"
        >
          <img
            src={whatItIsForUrl}
            alt="Three panels. One, who it's for: telco customer-support agents juggling billing tickets and connectivity issues, piecing scattered complaints together and deciding what to escalate. Two, the problem: duplicate tickets read over and over, missed patterns with weak evidence, and overconfident AI or expensive models on every step. Three, what was built: ticket intake, recurring-pattern detection and tiered AI routing across low-cost, standard and flagship lanes — always the cheapest capable model, with anything below 70% confidence or money-related going to human review, then an escalation brief and next steps. Bottom strip: what agents get — evidence-backed patterns, a ready-to-send escalation brief, and an AI cost comparison against an all-flagship baseline."
            className="mx-auto w-full max-w-3xl"
            loading="lazy"
            decoding="async"
          />
        </a>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
            <ArrowRight /> Open the desk
          </Button>
          <Button size="sm" variant="outline" onClick={() => desk.setView("settings")}>
            <Settings2 /> Add your API access
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Solution architecture"
        sub="M1–M3 as built · input → orchestration → routing & execution → output"
        action={
          <a href={architectureUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">
              <Expand /> Open full size
            </Button>
          </a>
        }
      >
        <a
          href={architectureUrl}
          target="_blank"
          rel="noreferrer"
          title="Open full size in a new tab"
          className="block w-full overflow-hidden rounded-lg border bg-white p-2 transition-shadow hover:shadow-md"
        >
          <img
            src={architectureUrl}
            alt="COSTERA solution architecture: a triage desk sends synthetic tickets to the orchestrator, which routes each one through a cost-aware policy to the direct code lane, human review, a Tier 1 classifier or Tier 2 escalation, and returns evidence-labelled output. Supporting services: knowledge base, observability and cost analytics."
            className="mx-auto w-full max-w-4xl"
            loading="lazy"
            decoding="async"
          />
        </a>
        <InfoNote>
          Click the diagram to open it full size in a new tab. The picture labels model access as server-side secrets;
          that has since changed — every run now uses the reviewer's own session key from Settings, and nothing is read
          from server secrets.
        </InfoNote>
      </SectionCard>

      <SectionCard
        title="Step by step"
        sub="Input → orchestration → routing & execution → output"
        action={
          <a href={stepByStepUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">
              <Expand /> Open full size
            </Button>
          </a>
        }
      >
        <a
          href={stepByStepUrl}
          target="_blank"
          rel="noreferrer"
          title="Open full size in a new tab"
          className="block w-full overflow-hidden rounded-lg border bg-white p-2 transition-shadow hover:shadow-md"
        >
          <img
            src={stepByStepUrl}
            alt="Four steps in order. Step 1 Input: a batch of synthetic support tickets for ZephyrTel, a fictional telco; no real customer data, employer systems or live network feeds. Step 2 Orchestration: validate the request and classify each ticket with Tier 1, then select the cheapest capable lane at a 70% confidence floor. Step 3 Routing and execution: direct code lane knowledge-base lookups with zero generative-model tokens; Tier 2 summarises escalations or analyses clusters only when warranted; human review for uncertain cases, credits and refunds, never auto-resolved. Step 4 Output: evidence-backed patterns with ticket IDs, quotes, counts and confidence, plus an editable escalation brief and a cost readout for the run."
            className="mx-auto w-full max-w-5xl"
            loading="lazy"
            decoding="async"
          />
        </a>
      </SectionCard>

      <SectionCard title="Why it is built this way" sub="Four rules the routing follows">
        <div className="grid gap-3 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="flex gap-3 rounded-lg border bg-card p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-wash text-signal-deep">
                <p.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Start here" sub="Reviewer path · about two minutes">
        <ol className="space-y-3">
          {[
            {
              n: "1",
              body: (
                <>
                  Open <span className="font-medium">Settings</span>. No API key of your own? Press{" "}
                  <span className="font-medium">Use temporary reviewer access</span> — owner-provided access, enabled
                  for the review window only, with the key and endpoint kept server-side. Otherwise paste your provider
                  key and OpenAI-compatible base URL (public HTTPS, ending in <code>/compatible-mode/v1</code>) under
                  “Bring your own API access”.
                </>
              ),
            },
            {
              n: "2",
              body: (
                <>
                  Pick the models for the three tiers — the starred (Recommended) trio is the one this flow was tested
                  end-to-end with — then press <span className="font-medium">Test</span> on each tier until access is
                  confirmed.
                </>
              ),
            },
            {
              n: "3",
              body: (
                <>
                  On <span className="font-medium">Overview</span> (or Ticket inbox) press
                  <span className="font-medium"> Run triage</span> in the top-right. The desk classifies all tickets,
                  routes them, and fills Overview, Evidence &amp; patterns, Escalation brief and Cost analytics.
                </>
              ),
            },
          ].map((s) => (
            <li key={s.n} className="flex gap-3 rounded-lg border bg-card px-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-graphite text-xs font-bold text-graphite-ink">
                {s.n}
              </span>
              <p className="text-sm leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => desk.setView("settings")}>
            <Settings2 /> Go to Settings
          </Button>
          <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
            <ArrowRight /> See the results on Overview
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          <InfoNote tone="amber">
            Keys live in this page's memory only: a refresh clears them, and because this build has no database the run
            resets too — re-enter access and triage again. Cost figures are estimates from assumed per-model rates, not
            billing truth.
          </InfoNote>
          <InfoNote>
            All tickets, customers, plans and outages are synthetic. Patterns are observations in that synthetic data,
            not verified network truth.
          </InfoNote>
        </div>
      </SectionCard>
    </div>
  );
}
