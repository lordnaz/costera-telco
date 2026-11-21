import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  History,
  Hourglass,
  Inbox,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  Moon,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { postJson } from "../api";
import { computeCost, ratesForModels } from "../cost";
import { decisionReady, effective, effectiveModel, emptyCreds, sessionActive, sessionModels, TIERS } from "../credentials";
import type { SessionCreds, TierEntry, TierId } from "../credentials";
import { CHAT_OPTIONS, DECISION_CONTRACT_OPTIONS, families, isRecommendedFor } from "../models";
import type { CatalogModel } from "../models";
import type { Desk } from "../components/bits";
import { QwenLogo, IlmuLogo } from "../components/brand";
import { EmptyState, idleTest, InfoNote, ModelName, SectionCard, TicketChip, usd } from "../components/bits";
import type { TestState } from "../components/bits";
import { ModelCost } from "../components/ModelCost";
import { TicketDetail, TicketTable } from "../components/TicketTable";

export function TicketsView({ desk }: { desk: Desk }) {
  const ticket = desk.batch?.tickets.find((t) => t.id === desk.selected);
  const tr = desk.result?.tickets.find((t) => t.id === desk.selected);
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <SectionCard title="Ticket inbox" sub={`${desk.batch?.tickets.length ?? 0} synthetic tickets · ${desk.batch?.batchLabel ?? ""}`}>
        <TicketTable
          batch={desk.batch}
          result={desk.result}
          selected={desk.selected}
          onSelect={desk.setSelected}
          onOpen={desk.openTicket}
          pageSize={10}
        />
      </SectionCard>
      <SectionCard title="Ticket detail" sub="Message, rationale and evidence" className="xl:sticky xl:top-20">
        <TicketDetail
          ticket={ticket}
          tr={tr}
          result={desk.result}
          onOpen={desk.openTicket}
          onAdd={desk.addBrief}
          added={desk.extras.some((e) => e.ticketId === desk.selected)}
          onViewFindings={() => desk.setView("findings")}
        />
      </SectionCard>
    </div>
  );
}

export function HumanView({ desk }: { desk: Desk }) {
  const queue = desk.result?.humanQueue ?? [];
  if (!desk.result) {
    return (
      <EmptyState
        icon={Users}
        title="No run yet"
        sub="Run triage on Overview to build the human review queue. Low-confidence tickets and anything touching credits or refunds land here — never auto-resolved."
        action={
          <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
            <ArrowRight /> Open Overview
          </Button>
        }
      />
    );
  }
  return (
    <SectionCard
      title={
        <>
          Human review queue <Badge variant="secondary">{queue.length}</Badge>
        </>
      }
      sub="Low confidence or credits / refunds — do not auto-resolve"
    >
      {queue.length === 0 ? (
        <InfoNote>No tickets required human review in this run.</InfoNote>
      ) : (
        <ul className="space-y-3">
          {queue.map((h) => {
            const tr = desk.result!.tickets.find((t) => t.id === h.id);
            return (
              <li key={h.id} className="rounded-md border border-rule bg-paper-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TicketChip id={h.id} onClick={() => desk.openTicket(h.id)} />
                  {tr && <Badge variant="outline">{tr.intent ?? "unknown intent"}</Badge>}
                  {tr?.unsure && (
                    <Badge className="text-warn">Tier 1 unsure</Badge>
                  )}
                  <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">{h.reasons.join("; ")}</span>
                </div>
                {h.summary && (
                  <p className="mt-1.5 text-xs italic text-muted-foreground">
                    Summary ({desk.result!.models?.flash ? <ModelName>{desk.result!.models.flash}</ModelName> : "light lane"}):{" "}
                    {h.summary}
                  </p>
                )}
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => desk.openTicket(h.id)}>
                    Open ticket
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function PatternsView({ desk }: { desk: Desk }) {
  const patterns = desk.result?.patterns ?? [];
  if (!desk.result) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No patterns yet"
        sub="Run triage on Overview to cluster the synthetic batch into evidenced recurring patterns (3+ tickets per cluster)."
        action={
          <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
            <ArrowRight /> Open Overview
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-5">
      <SectionCard
        title={
          <>
            Evidence &amp; patterns <Badge variant="secondary">{patterns.length}</Badge>
          </>
        }
        sub="Observations in synthetic data — not verified network truth"
        action={
          <button
            type="button"
            onClick={() => desk.setView("findings")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-signal-deep hover:underline"
          >
            AI findings <ArrowRight className="size-3.5" />
          </button>
        }
      >
        {patterns.length === 0 ? (
          <InfoNote>No cluster reached the 3-ticket threshold.</InfoNote>
        ) : (
          <div className="space-y-4">
            {patterns.map((p) => (
              <article key={p.key} className="rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{p.title}</h3>
                  <Badge variant="secondary">{p.count} tickets</Badge>
                  <Badge variant="outline">{p.distinctCustomers} customers</Badge>
                  <Badge variant="outline">min conf {Math.round(p.confidenceMin * 100)}%</Badge>
                  <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    avg confidence {Math.round(p.confidenceAvg * 100)}% · intent {p.intent}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {p.evidence.map((e) => (
                    <li key={e.ticketId} className="text-sm">
                      <TicketChip id={e.ticketId} onClick={() => desk.openTicket(e.ticketId)} />
                      <span className="ml-2 italic">“{e.line}”</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-mono text-xs text-muted-foreground">{p.ticketIds.join(", ")}</p>
                <p className="mt-1 text-xs italic text-muted-foreground">{p.note}</p>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export function FindingsView({ desk }: { desk: Desk }) {
  const analyses = desk.result?.analyses ?? [];
  if (!desk.result) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No AI findings yet"
        sub="Run triage; heavy-lane analysis only for clusters that warrant it (high-volume, or containing unsure/candidate tickets)."
        action={
          <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
            <ArrowRight /> Open Overview
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-5">
      <SectionCard
        title={
          <>
            AI findings <Badge variant="secondary">{analyses.length}</Badge>
          </>
        }
        sub="Cross-ticket cluster analysis, warranted clusters only"
        action={
          <Badge className="text-warn">model-generated</Badge>
        }
      >
        {analyses.length === 0 ? (
          <InfoNote>No cluster warranted a heavy-lane analysis in this run.</InfoNote>
        ) : (
          <div className="space-y-4">
            {analyses.map((a) => (
              <article key={a.key} className="rounded-md border border-rule bg-paper-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{a.title}</h3>
                  <Badge variant="outline">{a.count} tickets</Badge>
                  <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    Model-generated (<ModelName>{a.model}</ModelName>) — verify before acting
                  </span>
                </div>
                <p className="mt-2 text-sm">{a.summary}</p>
                {a.likelyCause && (
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Likely cause:</span> {a.likelyCause}
                  </p>
                )}
                {a.nextStep && (
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Next step:</span> {a.nextStep}
                  </p>
                )}
                {a.caveats && <p className="mt-1 text-xs italic text-muted-foreground">{a.caveats}</p>}
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {a.ticketIds.map((id) => (
                    <TicketChip key={id} id={id} onClick={() => desk.openTicket(id)} />
                  ))}
                </p>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export function BriefView({ desk }: { desk: Desk }) {
  if (!desk.result) {
    return (
      <EmptyState
        icon={FileText}
        title="No draft yet"
        sub="The escalation brief is assembled deterministically from evidence after a triage run."
        action={
          <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
            <ArrowRight /> Open Overview
          </Button>
        }
      />
    );
  }
  return (
    <SectionCard
      title="Draft escalation brief"
      sub="Assembled deterministically from evidence — review before sending"
      action={
        <Button size="sm" variant="outline" onClick={desk.copyBrief}>
          {desk.copied ? <Check /> : <Copy />} {desk.copied ? "Copied" : "Copy brief"}
        </Button>
      }
    >
      <pre className="scrollbar-thin max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/60 p-3 font-mono text-xs leading-relaxed sm:p-4">
        {desk.result.brief}
      </pre>
      {desk.extras.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Marked for brief review · session only
          </p>
          {desk.extras.map((e) => (
            <p key={e.ticketId} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
              <span className="flex-1">{e.line}</span>
              <button
                type="button"
                aria-label={`Remove mark for ${e.ticketId}`}
                onClick={() => desk.removeBrief(e.ticketId)}
                className="rounded-md p-1 text-muted-foreground hover:bg-paper-2 hover:text-error"
              >
                <Trash2 className="size-3.5" />
              </button>
            </p>
          ))}
        </div>
      )}
      <div className="mt-3">
        <InfoNote>
          Verify all findings before sending. Tier 2 sections are model-generated. Marks above are a local review aid
          only — they never change the draft, are not copied, and are never sent.
        </InfoNote>
      </div>
    </SectionCard>
  );
}

export function CostView({ desk }: { desk: Desk }) {
  return (
    <div className="space-y-5">
      <SectionCard title="Cost analytics" sub="Routed cost vs an all-flagship baseline · every figure an estimate">
        <div className="space-y-4">
          <InfoNote>
            Compare routing strategies: in Settings, point all three tiers at the same flagship model and run triage;
            then switch back to a tiered mix (cheap classifier + light summaries + flagship only where warranted) and
            run again. Each run below is priced with the models it actually used, so the difference between the two
            routed estimates is what tiering saves.
          </InfoNote>
          <ModelCost
            stats={desk.result?.stats ?? null}
            models={desk.result?.models}
            session={desk.demoMode ? desk.demoModels : sessionModels(desk.creds)}
          />
        </div>
      </SectionCard>
      <SectionCard title="Cost per run" sub="Runs made in this browser tab, not persisted, priced at their own models' assumed rates">
        {desk.runs.length === 0 ? (
          <InfoNote>No runs yet in this session. Run triage to record cost figures.</InfoNote>
        ) : (
          <>
          <ul className="space-y-2 sm:hidden">
            {desk.runs.map((r) => {
              const c = computeCost(r.stats, ratesForModels(r.models));
              return (
                <li key={r.id} className="rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold">{r.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(r.at).toLocaleTimeString()}</p>
                  </div>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                    {r.models.decision} / {r.models.flash} / {r.models.max}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/60 px-1 py-1.5">
                      <dt className="text-[10px] text-muted-foreground">Routed</dt>
                      <dd className="font-mono text-xs font-semibold">{usd(c.routed)}</dd>
                    </div>
                    <div className="rounded-md bg-muted/60 px-1 py-1.5">
                      <dt className="text-[10px] text-muted-foreground">Baseline</dt>
                      <dd className="font-mono text-xs font-semibold">{usd(c.baseline)}</dd>
                    </div>
                    <div className="rounded-md bg-signal-wash px-1 py-1.5">
                      <dt className="text-[10px] text-muted-foreground">Saved</dt>
                      <dd className="font-mono text-xs font-semibold text-signal-deep">
                        {c.savingsPct != null ? `${c.savingsPct.toFixed(0)}%` : "—"}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <div className="scrollbar-thin hidden overflow-x-auto rounded-lg border sm:block">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Models (T1 / light / heavy)</th>
                  <th className="px-3 py-2 font-medium">Routed est.</th>
                  <th className="px-3 py-2 font-medium">All-flagship baseline</th>
                  <th className="px-3 py-2 font-medium">Saved</th>
                </tr>
              </thead>
              <tbody>
                {desk.runs.map((r) => {
                  const c = computeCost(r.stats, ratesForModels(r.models));
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.id.slice(0, 8)} · {new Date(r.at).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {r.models.decision} / {r.models.flash} / {r.models.max}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{usd(c.routed)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{usd(c.baseline)}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-signal-deep">
                        {c.savingsPct != null ? `${c.savingsPct.toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

export function HistoryView({ desk }: { desk: Desk }) {
  return (
    <SectionCard
      title={
        <>
          Run history <Badge variant="secondary">{desk.runs.length}</Badge>
        </>
      }
      sub="Runs made in this browser tab, not persisted · full request/response logs also live in logs/ (local) or Pages console"
    >
      {desk.runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No runs in this session"
          sub="Each triage run records per-ticket Tier 1/Tier 2 requests and responses. Run triage on Overview to start the history."
          action={
            <Button size="sm" variant="outline" onClick={() => desk.setView("overview")}>
              <ArrowRight /> Open Overview
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {desk.runs.map((r) => {
            const c = computeCost(r.stats, ratesForModels(r.models));
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 sm:px-4">
                <span className="flex size-9 items-center justify-center rounded-md bg-signal-wash text-signal-deep">
                  <History className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold">{r.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.at).toLocaleString()} · {r.stats.tickets} tickets · {r.stats.tier1Calls} Tier 1 ·{" "}
                    {r.stats.tier2.light.calls} light · {r.stats.tier2.heavy.calls} heavy
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                    {r.models.decision} → {r.models.flash} / {r.models.max}
                    {r.decisionEngine === "chat" ? " · chat classifier" : ""}
                  </p>
                </div>
                <Badge variant={r.mode === "live" ? "secondary" : "outline"}>{r.mode}</Badge>
                <Badge
                  variant="outline"
                  title={
                    r.mode === "fixture"
                      ? "Simulated responses — no API key used"
                      : r.keySource === "session"
                        ? "Reviewer-supplied session key (memory only)"
                        : "Server environment key"
                  }
                >
                  {r.mode === "fixture" ? "no key" : r.keySource === "session" ? "session key" : "server key"}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {usd(c.routed)} est. · {c.savingsPct != null ? `${c.savingsPct.toFixed(0)}% saved` : "—"}
                </span>
                <Button size="sm" variant="outline" onClick={() => desk.openLog(r.id)}>
                  <FileText /> View trace
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function SettingsView({ desk }: { desk: Desk }) {
  const themes = [
    { id: "system", label: "System", icon: Monitor },
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
  ];
  return (
    <div className="space-y-5">
      <ByoAccess desk={desk} />
      <div className="grid items-start gap-5 sm:grid-cols-2">
      <SectionCard title="Appearance" sub="Theme preference is stored in this browser">
        <div className="flex gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => desk.setTheme(t.id)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors ${
                desk.theme === t.id
                  ? "border-signal bg-signal-wash text-signal-deep"
                  : "hover:bg-muted"
              }`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Workspace" sub="Demo workspace · synthetic data only">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Telco</dt>
            <dd className="font-medium">ZephyrTel (fictional)</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Batch</dt>
            <dd className="font-medium">{desk.batch?.batchLabel ?? "Loading…"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Service mode</dt>
            <dd className="font-medium">
              {desk.health
                ? desk.health.mode === "fixture"
                  ? "fixture · simulated responses"
                  : desk.demoMode
                    ? "live · temporary reviewer access"
                    : desk.health.configured
                      ? "live · reviewer access available"
                      : "live · session keys only"
                : "Connecting…"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Tickets</dt>
            <dd className="font-mono">{desk.batch?.tickets.length ?? 0}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Routing policy" sub="Deterministic rules applied after the Tier 1 classifier">
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            Confidence below 70% → human review, flagged unsure.
          </li>
          <li className="flex gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            Credits / refunds → human review regardless of confidence.
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-signal-deep" />
            Complex with no deterministic answer → Tier 2 candidate; heavy-lane analysis only for warranted clusters (4+
            tickets, or 2+ with unsure/candidate members), max 4 analyses per run.
          </li>
          <li className="flex gap-2">
            <Inbox className="mt-0.5 size-4 shrink-0 text-signal-deep" />
            Everything else → direct code lane, zero model tokens.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Data safety" sub="What this demo never touches">
        <ul className="space-y-2 text-sm">
          <li>All tickets, customers, plans and outages are synthetic, generated from scratch.</li>
          <li>Your session key and endpoint are used server-side for that one request only — never stored, logged or written to browser storage.</li>
          <li>
            Temporary reviewer access, when enabled, keeps the owner's key and endpoint server-side: the browser never
            receives them, and the access is retired after the bounty review.
          </li>
          <li>No real customer data, employer systems or live network feeds; provider names appear only as selectable model options.</li>
          <li>Run logs record request/response bodies but never keys, headers or the hostname.</li>
        </ul>
        <div className="mt-3">
          <InfoNote>
            Tier 1 input tokens this session:{" "}
            {desk.runs.reduce((n, r) => n + r.stats.inputTokens, 0).toLocaleString("en-US")} across {desk.runs.length}{" "}
            run(s).
          </InfoNote>
        </div>
      </SectionCard>
      </div>
    </div>
  );
}

const idleTests = (): Record<TierId, TestState> => ({
  decision: idleTest(),
  flash: idleTest(),
  max: idleTest(),
});

function SecretInput({
  value,
  onChange,
  placeholder,
  shown,
  onToggle,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  shown: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <span className="relative block flex-1">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-md border border-input bg-key-face py-1.5 pl-2.5 pr-8 font-mono text-xs transition-colors focus:border-signal"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={shown ? "Hide value" : "Show value"}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </span>
  );
}

function ByoAccess({ desk }: { desk: Desk }) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState<Record<TierId, boolean>>({ decision: false, flash: false, max: false });
  const [setupOpen, setSetupOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const tests = desk.tierStatus;
  const demo = desk.demoMode;
  const models = demo
    ? desk.demoModels
    : {
        decision: desk.creds.tiers.decision.model,
        flash: desk.creds.tiers.flash.model,
        max: desk.creds.tiers.max.model,
      };
  const engine = demo ? desk.demoEngine : desk.creds.decisionEngine;
  const setTest = (id: TierId, s: TestState) => desk.setTierStatus(id, s);
  const setModel = (id: TierId, model: string) => {
    if (demo) desk.setDemoModels({ ...desk.demoModels, [id]: model });
    else desk.setCreds({ ...desk.creds, tiers: { ...desk.creds.tiers, [id]: { ...desk.creds.tiers[id], model } } });
    setTest(id, idleTest());
  };
  const setEngine = (e: "systemone" | "chat") => {
    if (demo) desk.setDemoEngine(e);
    else desk.setCreds({ ...desk.creds, decisionEngine: e });
  };
  const toggle = (k: string) => setShown((s) => ({ ...s, [k]: !s[k] }));
  const setShared = (patch: Partial<Pick<SessionCreds, "key" | "baseUrl">>) => {
    desk.setCreds({ ...desk.creds, ...patch });
    for (const t of TIERS) setTest(t.id, idleTest());
  };
  const setTier = (id: TierId, patch: Partial<TierEntry>) => {
    desk.setCreds({ ...desk.creds, tiers: { ...desk.creds.tiers, [id]: { ...desk.creds.tiers[id], ...patch } } });
    setTest(id, idleTest());
  };
  const pickClassifier = (v: string) => {
    if (v === "__none") {
      setCustom((c) => ({ ...c, decision: false }));
      setModel("decision", "");
    } else if (v.startsWith("systemone")) {
      setCustom((c) => ({ ...c, decision: false }));
      setEngine("systemone");
      setModel("decision", v.includes(":") ? v.slice("systemone:".length) : "decision-model-preview");
    } else if (v === "__custom") {
      setCustom((c) => ({ ...c, decision: true }));
      setEngine("chat");
      setModel("decision", "");
    } else {
      setCustom((c) => ({ ...c, decision: false }));
      setEngine("chat");
      setModel("decision", v.slice(5));
    }
    setTest("decision", idleTest());
  };
  const pickTier = (id: TierId, v: string) => {
    if (v === "__none") {
      setCustom((c) => ({ ...c, [id]: false }));
      setModel(id, "");
    } else if (v === "__custom") {
      setCustom((c) => ({ ...c, [id]: true }));
      setModel(id, "");
    } else {
      setCustom((c) => ({ ...c, [id]: false }));
      setModel(id, v);
    }
  };
  const modelOptions = (tier: TierId, list: CatalogModel[]) =>
    families(list).map((f) => (
      <optgroup key={f} label={f === "Qwen" ? "Qwen (verified end-to-end)" : f}>
        {list
          .filter((m) => m.family === f)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}, {m.role}
              {isRecommendedFor(tier, m.id) ? " (recommended)" : ""}
            </option>
          ))}
      </optgroup>
    ));
  const classifierValue = custom.decision
    ? "__custom"
    : models.decision.trim() === ""
      ? "__none"
      : engine === "systemone"
        ? `systemone:${models.decision.trim()}`
        : `chat:${models.decision.trim()}`;
  const test = async (id: TierId) => {
    const e = demo ? null : effective(desk.creds, id);
    if (!demo && (!e || !e.key || !e.baseUrl)) {
      setTest(id, { state: "error", message: "Enter a key and an HTTPS endpoint first (shared or per-tier)." });
      return;
    }
    setTest(id, { state: "testing", message: "" });
    try {
      const r = await postJson<{ ok: boolean; models?: number | null; error?: string; message?: string }>(
        "/api/credentials",
        demo ? { tier: id, demo: true, demoProvider: desk.demoProvider } : { tier: id, key: e!.key, baseUrl: e!.baseUrl },
      );
      setTest(
        id,
        r.ok
          ? {
              state: "ok",
              message:
                r.models != null
                  ? `Access confirmed: ${r.models} models visible on this endpoint`
                  : "Access confirmed: key accepted by endpoint",
            }
          : { state: "error", message: r.message ?? r.error ?? "Rejected by endpoint." },
      );
    } catch (err) {
      setTest(id, { state: "error", message: err instanceof Error ? err.message : "Test failed." });
    }
  };
  const active = sessionActive(desk.creds);
  return (
    <SectionCard
      title={
        <>
          {demo ? "Reviewer API access" : "Bring your own API access"}{" "}
          <Badge variant="outline">{demo ? "temporary review window" : "session only"}</Badge>
        </>
      }
      sub={
        demo
          ? "Owner-provided server-side access for the bounty review. The key and endpoint stay hidden and are retired after review."
          : "Your own key per tier model. Nothing is ever billed to the site owner unless you opt into the temporary reviewer access."
      }
      action={
        demo ? (
          <Button size="sm" variant="outline" onClick={desk.exitDemo}>
            <LogOut /> Exit reviewer access
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!active}
            onClick={() => {
              desk.setCreds(emptyCreds());
              TIERS.forEach((t) => desk.setTierStatus(t.id, idleTest()));
            }}
          >
            <Trash2 /> Clear session keys
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-rule bg-paper-2 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <FlaskConical className="size-4 shrink-0 text-signal-deep" />
            <p className="min-w-0 flex-1 text-sm text-ink-2">
              <span className="font-semibold text-foreground">Recommended setup.</span> Verified end-to-end with the
              Qwen and ILMU families.
            </p>
            <button
              type="button"
              onClick={() => setSetupOpen((v) => !v)}
              aria-expanded={setupOpen}
              className="hit-44 -my-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-signal-deep hover:underline active:text-signal"
            >
              Models and endpoints
              <ChevronDown className={`size-3.5 transition-transform ${setupOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {!demo && (desk.demoInfo?.available || desk.demoInfo?.ilmu?.available) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
              {desk.demoInfo?.available && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => desk.requestDemo("qwen")}
                  className="border-[#082dff]/30 bg-white text-[#082dff] shadow-sm hover:bg-[#082dff]/5 hover:text-[#082dff] dark:border-[#082dff]/60 dark:bg-white dark:hover:bg-[#082dff]/10"
                >
                  <QwenLogo className="size-4" /> Use Qwen family preset
                </Button>
              )}
              {desk.demoInfo?.ilmu?.available && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => desk.requestDemo("ilmu")}
                  className="border-[#0048cc]/30 bg-white text-[#00205b] shadow-sm hover:bg-[#0048cc]/5 hover:text-[#0048cc] dark:border-[#0048cc]/60 dark:bg-white dark:hover:bg-[#0048cc]/10"
                >
                  <IlmuLogo className="size-4" /> Use ILMU family preset
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground">
                No key of your own? Borrow the owner's pre-setup for the review window.
              </span>
            </div>
          )}
          {setupOpen && (
            <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-ink-2">
              <li>
                <span className="font-medium text-foreground">Tier 1 classifier:</span>{" "}
                <ModelName>decision-model-preview</ModelName>, decision contract (/systemone), calibrated probabilities
              </li>
              <li>
                <span className="font-medium text-foreground">Tier 2 light:</span> <ModelName>qwen3.8-flash</ModelName>,
                chat/completions
              </li>
              <li>
                <span className="font-medium text-foreground">Tier 2 heavy:</span> <ModelName>qwen3.8-max</ModelName>,
                chat/completions
              </li>
              <li>
                <span className="font-medium text-foreground">ILMU family (also verified end-to-end):</span>{" "}
                <ModelName>ilmu-mini-v3.3</ModelName> (Tier 1), <ModelName>ilmu-glm-5.3-flash</ModelName> (Tier 2
                light), <ModelName>ilmu-glm-5.3</ModelName> (Tier 2 heavy), all via chat/completions
              </li>
              <li>
                <span className="font-medium text-foreground">Qwen endpoint:</span> an Alibaba MaaS (Qwen)
                OpenAI-compatible base URL ending in <span className="font-mono">/compatible-mode/v1</span>; one shared
                API key covers all three tiers.
              </li>
              <li>
                <span className="font-medium text-foreground">ILMU endpoint:</span> an ILMU OpenAI-compatible base URL
                ending in <span className="font-mono">/v1</span>; one shared API key covers all three tiers.
              </li>
            </ul>
          )}
        </div>
        {demo && (
          <div className="flex items-start gap-2.5 rounded-md border border-rule bg-paper-2 px-3.5 py-3">
            <Hourglass className="mt-0.5 size-4 shrink-0 text-signal-deep" />
            <div className="flex-1 text-xs text-ink-2">
              <p className="font-semibold text-foreground">
                Temporary reviewer access active ({desk.demoProvider === "ilmu" ? "ILMU" : "Qwen"} preset)
              </p>
              <p className="mt-1">
                The owner's pre-configured key and endpoint are used server-side for the bounty review window only.
                They are never shown in this browser and cannot be edited here. This access will be disabled after the
                submission has been reviewed and approved; afterwards only your own API key works. Press Test on all
                three tiers below to unlock Run triage.
              </p>
            </div>
          </div>
        )}
        {demo ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3.5 py-2.5 text-xs text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            Key &amp; endpoint: hidden — managed server-side for the review window. Not viewable or editable in this
            mode, so nothing here can overwrite the pre-setup env.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Shared base URL (all tiers)</span>
              <input
                value={desk.creds.baseUrl}
                onChange={(e) => setShared({ baseUrl: e.target.value })}
                placeholder="https://your-maas-host/compatible-mode/v1"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-signal focus:ring-2 focus:ring-signal/25"
              />
            </label>
            <div>
              <span className="text-xs font-medium text-muted-foreground">Shared API key (all tiers)</span>
              <span className="mt-1 flex">
                <SecretInput
                  value={desk.creds.key}
                  onChange={(v) => setShared({ key: v })}
                  placeholder="Your API key"
                  shown={!!shown.shared}
                  onToggle={() => toggle("shared")}
                  ariaLabel="Shared API key"
                />
              </span>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {TIERS.map((t) => {
            const ts = tests[t.id];
            return (
              <div key={t.id} className="rounded-md border px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <KeyRound className="size-3.5 text-ink-3" />
                  <span className="text-xs font-semibold text-foreground">{t.label}</span>
                  {models[t.id].trim() && <ModelName>{models[t.id].trim()}</ModelName>}
                  {isRecommendedFor(t.id, models[t.id].trim()) && (
                    <span className="rounded-md bg-signal-wash px-2 py-0.5 text-[10px] font-medium text-signal-deep">
                      recommended
                    </span>
                  )}
                  <span
                    className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium ${
                      demo
                        ? "bg-signal-wash text-signal-deep"
                        : effective(desk.creds, t.id).key
                          ? "bg-ok-wash text-ok"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {demo ? "server-side key" : effective(desk.creds, t.id).key ? "key set" : "no key"}
                  </span>
                </div>
                <div className="mt-2">
                  {t.id === "decision" ? (
                    <select
                      value={classifierValue}
                      onChange={(e) => pickClassifier(e.target.value)}
                      aria-label="Classifier type and model"
                      className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-signal"
                    >
                      <option value="__none">No selection, choose a model</option>
                      <optgroup label="Decision contract /systemone (recommended for Tier 1)">
                        {DECISION_CONTRACT_OPTIONS.map((m) => (
                          <option key={m.id} value={`systemone:${m.id}`}>
                            {m.name ? `${m.name}, ` : ""}
                            {m.id}, calibrated probabilities
                            {isRecommendedFor("decision", m.id) ? " (recommended)" : ""}
                          </option>
                        ))}
                      </optgroup>
                      {families(CHAT_OPTIONS).map((f) => (
                        <optgroup
                          key={f}
                          label={f === "Qwen" ? "Chat classifier, Qwen (verified end-to-end)" : `Chat classifier, ${f}`}
                        >
                          {CHAT_OPTIONS.filter((m) => m.family === f).map((m) => (
                            <option key={m.id} value={`chat:${m.id}`}>
                              {m.id}, {m.role}
                              {isRecommendedFor("decision", m.id) ? " (recommended)" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="__custom">Custom chat model ID…</option>
                    </select>
                  ) : (
                    <select
                      value={custom[t.id] ? "__custom" : models[t.id].trim() || "__none"}
                      onChange={(e) => pickTier(t.id, e.target.value)}
                      aria-label={`${t.label} model`}
                      className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-signal"
                    >
                      <option value="__none">No selection, choose a model</option>
                      {modelOptions(t.id, CHAT_OPTIONS)}
                      <option value="__custom">Custom model ID…</option>
                    </select>
                  )}
                  {custom[t.id] && (
                    <input
                      value={models[t.id]}
                      onChange={(e) => setModel(t.id, e.target.value)}
                      placeholder="Custom model ID exactly as your endpoint names it"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={`${t.label} custom model ID`}
                      className="mt-2 w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-signal focus:ring-2 focus:ring-signal/25"
                    />
                  )}
                </div>
                {demo ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      <Lock className="size-3.5 shrink-0" /> Key and URL hidden, supplied server-side
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ts.state === "testing"}
                      onClick={() => test(t.id)}
                    >
                      {ts.state === "testing" ? <Loader2 className="animate-spin" /> : <Check />} Test
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <input
                      value={desk.creds.tiers[t.id].baseUrl}
                      onChange={(e) => setTier(t.id, { baseUrl: e.target.value })}
                      placeholder="Per-tier URL (else shared URL)"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={`${t.model} base URL`}
                      className="w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-signal focus:ring-2 focus:ring-signal/25"
                    />
                    <SecretInput
                      value={desk.creds.tiers[t.id].key}
                      onChange={(v) => setTier(t.id, { key: v })}
                      placeholder="Per-tier key (else shared key)"
                      shown={!!shown[t.id]}
                      onToggle={() => toggle(t.id)}
                      ariaLabel={`${t.model} API key`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ts.state === "testing"}
                      onClick={() => test(t.id)}
                    >
                      {ts.state === "testing" ? <Loader2 className="animate-spin" /> : <Check />} Test
                    </Button>
                  </div>
                )}
                {ts.state === "ok" && (
                  <p
                    title="The endpoint accepted your key and returned its model list. It does not prove the selected model answers chat calls — run triage and check the run trace for that."
                    className="mt-1.5 cursor-help text-xs text-ok underline decoration-dotted decoration-ok/40 underline-offset-2"
                  >
                    {ts.message}
                  </p>
                )}
                {ts.state === "error" && <p className="mt-1.5 text-xs text-error">{ts.message}</p>}
              </div>
            );
          })}
        </div>
        {engine === "chat" && (
          <InfoNote tone="amber">
            Classifier runs on the chat contract, so the flagship (or any chat model) can classify. Confidence is
            self-reported by the model (no calibrated probabilities), and the 70% unsure floor plus refund rules
            still apply.
          </InfoNote>
        )}
        <InfoNote>
          {active
            ? decisionReady(desk.creds)
              ? "Session access detected. Runs use only your keys, never a server-side secret. Every tier still needs a key, an HTTPS endpoint and a chosen model, each Test-confirmed, before Run triage proceeds."
              : "Session key detected, but the Tier 1 classifier key and HTTPS endpoint are incomplete; triage stays blocked until they are set."
            : "No session key set. This deployment has no server-side key of its own, so real runs need your own access here."}
        </InfoNote>
        <div className="rounded-md border border-rule bg-paper-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setDisclaimerOpen((v) => !v)}
            aria-expanded={disclaimerOpen}
            className="hit-44 -my-2 inline-flex min-h-9 w-full items-center gap-2 text-left text-xs font-semibold text-ink-2 transition-transform active:translate-y-px"
          >
            <FlaskConical className="size-4 shrink-0 text-warn" />
            <span className="flex-1">Reviewer testing disclaimer</span>
            <ChevronDown className={`size-4 transition-transform ${disclaimerOpen ? "rotate-180" : ""}`} />
          </button>
          {disclaimerOpen && (
            <p className="mt-2 border-t pt-2 text-xs leading-relaxed text-ink-2">
              The full end-to-end workflow — classify, route, escalate, brief and cost readout — has been tested and
              verified with two families: Qwen (<ModelName>decision-model-preview</ModelName> Tier 1,{" "}
              <ModelName>qwen3.8-flash</ModelName> Tier 2 light, <ModelName>qwen3.8-max</ModelName> Tier 2 heavy) and
              ILMU (<ModelName>ilmu-mini-v3.3</ModelName> Tier 1, <ModelName>ilmu-glm-5.3-flash</ModelName> Tier 2
              light, <ModelName>ilmu-glm-5.3</ModelName> Tier 2 heavy). Other providers and models share the same
              OpenAI-compatible contract but are not end-to-end verified: response shapes, confidence calibration and
              assumed rates may differ. Use the per-tier Test button and check the run trace before relying on results.
            </p>
          )}
        </div>
        <InfoNote>
          {demo
            ? "Temporary reviewer access lives in this page's memory only: a refresh clears it and returns the desk to bring-your-own. There is no database in this build, so reloading also resets the desk itself — the last run, findings, brief and history disappear and triage has to be run again. The owner's key and endpoint never reach this browser."
            : "Keys and endpoints live in this page's memory only: a refresh clears them and you must enter them again. There is no database in this build, so reloading also resets the desk itself — the last run, findings, brief and history disappear and triage has to be run again. Credentials are sent to this site's server over HTTPS solely for your run — never stored, never logged, never written to disk or browser storage."}
        </InfoNote>
      </div>
    </SectionCard>
  );
}