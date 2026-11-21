import { useEffect, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import type { DemoAccessInfo, PresetId, SessionCreds } from "../credentials";
import type { Batch, Health, TicketResult, TraceEntry, TriageResult } from "../types";

export type View =
  | "how"
  | "overview"
  | "tickets"
  | "human"
  | "patterns"
  | "findings"
  | "brief"
  | "cost"
  | "history"
  | "settings";

export type TestState = { state: "idle" | "testing" | "ok" | "error"; message: string };
export type TierId = "decision" | "flash" | "max";
export const idleTest = (): TestState => ({ state: "idle", message: "" });

export interface RunRecord {
  id: string;
  at: string;
  mode: "live" | "fixture";
  keySource: "env" | "session";
  decisionEngine: "systemone" | "chat";
  models: { decision: string; flash: string; max: string };
  stats: TriageResult["stats"];
  trace: TraceEntry[];
}

export interface Desk {
  health: Health | null;
  batch: Batch | null;
  result: TriageResult | null;
  runs: RunRecord[];
  running: boolean;
  error: string | null;
  canRun: boolean;
  run: () => void;
  view: View;
  setView: (v: View) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  openTicket: (id: string) => void;
  openLog: (runId?: string) => void;
  extras: { ticketId: string; line: string }[];
  addBrief: (id: string) => void;
  removeBrief: (id: string) => void;
  theme: string;
  setTheme: (t: string) => void;
  creds: SessionCreds;
  setCreds: (c: SessionCreds) => void;
  tierStatus: Record<TierId, TestState>;
  setTierStatus: (t: TierId, s: TestState) => void;
  demoInfo: DemoAccessInfo | null;
  demoMode: boolean;
  demoModels: { decision: string; flash: string; max: string };
  setDemoModels: (m: { decision: string; flash: string; max: string }) => void;
  demoEngine: "systemone" | "chat";
  setDemoEngine: (e: "systemone" | "chat") => void;
  demoProvider: PresetId;
  requestDemo: (p: PresetId) => void;
  exitDemo: () => void;
  copyBrief: () => void;
  copied: boolean;
}

export const usd = (v: number) => `$${v.toFixed(4)}`;
export const tok = (n: number) => n.toLocaleString("en-US");

export function ModelName({ children }: { children: ReactNode }) {
  return <span className="model-name font-mono">{children}</span>;
}

// Status is text with one icon, never a filled chip (Cobalt).
export function LaneBadge({ lane }: { lane: TicketResult["lane"] }) {
  const map = {
    direct: ["text-ok", CircleCheck, "Direct / code", "Deterministic knowledge-base lookup, no generation call"],
    human_review: ["text-warn", TriangleAlert, "Human review", "Handed to a human, never auto-resolved"],
    tier2_candidate: ["text-signal-deep", ArrowUpRight, "Tier 2 candidate", "Escalated to Tier 2: a light-lane summary, and heavy-lane analysis if the cluster warrants it"],
    error: ["text-error", CircleX, "Error", "Classification failed for this ticket, see run log"],
  } as const;
  const [cls, Icon, label, tip] = map[lane];
  return (
    <span title={tip} className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium ${cls}`}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export function StageBadge({ stage }: { stage: TraceEntry["stage"] }) {
  const map = {
    tier1: "Tier 1",
    tier2_light: "Tier 2 light",
    tier2_heavy: "Tier 2 heavy",
  } as const;
  return <span className="inline-flex rounded-md border border-rule px-1.5 py-0.5 text-[11px] font-medium text-ink-3">{map[stage]}</span>;
}

export function ConfidenceBar({
  value,
  probabilities,
}: {
  value: number | null;
  probabilities?: Record<string, number> | null;
}) {
  if (value === null) return <span className="text-xs text-muted-foreground">n/a</span>;
  const pct = Math.round(value * 100);
  const tone = value < 0.7 ? "bg-warn" : "bg-ok";
  const tip =
    probabilities && Object.keys(probabilities).length > 0
      ? `Tier 1 classifier: ${Object.entries(probabilities)
          .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
          .join(", ")}`
      : "Tier 1 classifier confidence";
  return (
    <span className="inline-flex items-center gap-2" title={tip}>
      <span className="h-1.5 w-16 overflow-hidden rounded-[2px] bg-paper-3">
        <span className={`block h-full rounded-[2px] ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs">{pct}%</span>
    </span>
  );
}

// tone and delay are kept for call-site compatibility; app screens take no
// reveal-on-load and no per-tile hues — one paper panel, one ink.
export function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone?: string;
  delay?: number;
}) {
  return (
    <div className="panel px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-ink-3" />
        <p className="text-[11px] font-medium text-ink-3 sm:text-xs">{label}</p>
      </div>
      <p className="mt-1.5 font-mono text-xl font-semibold tracking-tight sm:mt-2 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-3">{sub}</p>
    </div>
  );
}

export function SectionCard({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </header>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  );
}

export function InfoNote({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "amber" }) {
  const cls =
    tone === "amber"
      ? "bg-paper-2 text-warn"
      : "bg-paper-2 text-ink-3";
  const Icon = tone === "amber" ? AlertTriangle : Info;
  return (
    <p className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${cls}`}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  sub,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-rule-2 bg-paper-2 px-6 py-10 text-center">
      <Icon className="size-5 text-ink-3" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{sub}</p>
      {action}
    </div>
  );
}

export function TicketChip({ id, onClick }: { id: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hit-44 inline-flex min-h-9 items-center rounded-md border border-rule bg-key-face px-2 font-mono text-[11px] text-ink-2 transition-colors hover:border-signal hover:text-signal-deep"
    >
      {id}
    </button>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-graphite/60" onClick={onClose} />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full flex-col border-l border-rule bg-card shadow-2xl ${wide ? "max-w-2xl" : "max-w-xl"}`}
      >
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="hit-44 -mr-1 flex size-9 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{children}</div>
      </aside>
    </div>
  );
}