import { useEffect, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import type { DemoAccessInfo, SessionCreds } from "../credentials";
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
  requestDemo: () => void;
  exitDemo: () => void;
  copyBrief: () => void;
  copied: boolean;
}

export const usd = (v: number) => `$${v.toFixed(4)}`;
export const tok = (n: number) => n.toLocaleString("en-US");

export function ModelName({ children }: { children: ReactNode }) {
  return <span className="model-name font-mono">{children}</span>;
}

export function LaneBadge({ lane }: { lane: TicketResult["lane"] }) {
  const map = {
    direct: ["bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300", "Direct / code", "Deterministic knowledge-base lookup — no generation call"],
    human_review: ["bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300", "Human review", "Handed to a human — never auto-resolved"],
    tier2_candidate: ["bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", "Tier 2 candidate", "Escalated to Tier 2: a light-lane summary, and heavy-lane analysis if the cluster warrants it"],
    error: ["bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300", "Error", "Classification failed for this ticket — see run log"],
  } as const;
  const [cls, label, tip] = map[lane];
  return (
    <span title={tip} className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function StageBadge({ stage }: { stage: TraceEntry["stage"] }) {
  const map = {
    tier1: ["bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", "Tier 1"],
    tier2_light: ["bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300", "Tier 2 light"],
    tier2_heavy: ["bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300", "Tier 2 heavy"],
  } as const;
  const [cls, label] = map[stage];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

export function ConfidenceBar({
  value,
  probabilities,
}: {
  value: number | null;
  probabilities?: Record<string, number> | null;
}) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const tone = value < 0.7 ? "bg-amber-500" : "bg-teal-500";
  const tip =
    probabilities && Object.keys(probabilities).length > 0
      ? `Tier 1 classifier · ${Object.entries(probabilities)
          .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
          .join(" · ")}`
      : "Tier 1 classifier confidence";
  return (
    <span className="inline-flex items-center gap-2" title={tip}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs">{pct}%</span>
    </span>
  );
}

const KPI_TONES = {
  blue: ["bg-blue-50/70 border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50", "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"],
  amber: ["bg-amber-50/70 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50", "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"],
  violet: ["bg-violet-50/70 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/50", "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300"],
  teal: ["bg-teal-50/70 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900/50", "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300"],
} as const;

export function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  delay = 0,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: keyof typeof KPI_TONES;
  delay?: number;
}) {
  const [card, chip] = KPI_TONES[tone];
  return (
    <div className={`rise rounded-xl border px-3 py-3 shadow-xs sm:px-4 sm:py-3.5 ${card}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 sm:gap-2.5">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8 ${chip}`}>
          <Icon className="size-3.5 sm:size-4" />
        </span>
        <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
      </div>
      <p className="mt-1.5 font-mono text-xl font-semibold tracking-tight sm:mt-2 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-[11px]">{sub}</p>
    </div>
  );
}

export function SectionCard({
  title,
  sub,
  action,
  children,
  className = "",
  delay = 0,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section className={`rise rounded-xl border bg-card shadow-xs ${className}`} style={{ animationDelay: `${delay}ms` }}>
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
      ? "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
      : "bg-muted/70 text-muted-foreground";
  const Icon = tone === "amber" ? AlertTriangle : Info;
  return (
    <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${cls}`}>
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
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300">
        <Icon className="size-5" />
      </span>
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
      className="rounded-md border bg-background px-2 py-0.5 font-mono text-[11px] transition-colors hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
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
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/60" onClick={onClose} />
      <aside
        className={`rise absolute right-0 top-0 flex h-full w-full flex-col border-l bg-card shadow-2xl ${wide ? "max-w-2xl" : "max-w-xl"}`}
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
            className="-mr-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:p-1.5"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{children}</div>
      </aside>
    </div>
  );
}