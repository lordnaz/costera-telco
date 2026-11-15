import architectureUrl from "@/docs/architecture.png";
import { ArrowRight, BookOpen, Expand, Layers, Play, Route, ScanSearch, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Desk } from "../components/bits";
import { InfoNote, SectionCard } from "../components/bits";

const STAGES: { icon: typeof Layers; label: string; tone: string; points: string[] }[] = [
  {
    icon: Layers,
    label: "1 · Input",
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    points: [
      "A batch of synthetic support tickets for ZephyrTel, a fictional telco.",
      "Nothing real: no customer data, no employer systems, no live network feeds.",
    ],
  },
  {
    icon: Route,
    label: "2 · Orchestration",
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    points: [
      "The orchestrator validates the request and asks Tier 1 to classify each ticket.",
      "A policy then picks the cheapest lane that can handle it, at a 70% confidence floor.",
    ],
  },
  {
    icon: ScanSearch,
    label: "3 · Routing & execution",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    points: [
      "Direct / code lane answers lookups from the knowledge base — zero generated tokens.",
      "Tier 2 light summarises the escalation set; Tier 2 heavy reads a whole cluster, only when warranted.",
      "Anything unsure, or touching credits and refunds, goes to a human — never auto-resolved.",
    ],
  },
  {
    icon: BookOpen,
    label: "4 · Output",
    tone: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
    points: [
      "Recurring patterns with ticket IDs, quoted lines, counts and confidence.",
      "A draft escalation brief an agent can edit, plus a cost readout of the run.",
    ],
  },
];

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
  const runLabel = desk.result ? "Triage complete" : desk.running ? "Triaging…" : `Run triage · ${desk.batch?.tickets.length ?? 0}`;
  return (
    <div className="space-y-5">
      <SectionCard
        title={
          <>
            The 30-second version <span className="text-muted-foreground text-sm font-normal">— what this desk does to a batch of tickets</span>
          </>
        }
      >
        <p className="text-sm leading-relaxed">
          COSTERA reads a batch of scattered support tickets, works out what each one is about, then sends every ticket
          to the <span className="font-medium">cheapest lane that can handle it</span>: a free knowledge-base lookup when
          an answer already exists, a small classifier to sort and summarise, and a heavyweight model only when a group
          of tickets really needs cross-ticket analysis. Anything the desk is unsure about, or that touches a customer's
          money, stops at a human with its reasoning and evidence attached. What comes back is a set of recurring
          patterns, a draft escalation brief, and an honest estimate of what the routing saved.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              desk.run();
              desk.setView("overview");
            }}
            disabled={!desk.canRun}
          >
            <Play /> {runLabel}
          </Button>
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

      <SectionCard title="Step by step" sub="The four columns of the diagram, in order">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-3">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${s.tone}`}>
                <s.icon className="size-3.5" />
                {s.label}
              </span>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-1.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Why it is built this way" sub="Four rules the routing follows">
        <div className="grid gap-3 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="flex gap-3 rounded-lg border bg-card p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
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

      <SectionCard title="Start here" sub="Reviewer path · about two minutes, your own key and quota">
        <ol className="space-y-3">
          {[
            {
              n: "1",
              body: (
                <>
                  Open <span className="font-medium">Settings</span> and under “Bring your own API access” paste your
                  provider key and OpenAI-compatible base URL (public HTTPS, ending in <code>/compatible-mode/v1</code>).
                </>
              ),
            },
            {
              n: "2",
              body: (
                <>
                  Pick the models for the three tiers — <span className="font-medium">Apply verified model setup</span>{" "}
                  sets the trio this flow was tested end-to-end with — then press <span className="font-medium">Test</span>{" "}
                  on each tier until access is confirmed.
                </>
              ),
            },
            {
              n: "3",
              body: (
                <>
                  Press <span className="font-medium">Run triage</span>. The desk classifies all tickets, routes them,
                  and fills Overview, Evidence &amp; patterns, Escalation brief and Cost analytics.
                </>
              ),
            },
          ].map((s) => (
            <li key={s.n} className="flex gap-3 rounded-lg border bg-card px-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">
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
