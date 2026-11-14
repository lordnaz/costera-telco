export interface Ticket {
  id: string;
  createdAt: string;
  channel: "chat" | "email" | "phone";
  customer: string;
  text: string;
}

export interface LookupHit {
  kind: "outage" | "plan" | "account" | "procedure";
  entity: string;
  label: string;
  detail: string;
}

export interface TicketResult {
  id: string;
  customer: string;
  channel: string;
  createdAt: string;
  text: string;
  intent: string | null;
  complexity: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  lane: "direct" | "human_review" | "tier2_candidate" | "error";
  unsure: boolean;
  reasons: string[];
  lookup: LookupHit | null;
  quotes: string[];
  summary: string | null;
  inputTokens: number | null;
  latencyMs: number | null;
}

export interface Pattern {
  key: string;
  title: string;
  intent: string;
  entity: string | null;
  ticketIds: string[];
  count: number;
  distinctCustomers: number;
  evidence: { ticketId: string; line: string }[];
  confidenceMin: number;
  confidenceAvg: number;
  note: string;
}

export interface ClusterAnalysis {
  key: string;
  title: string;
  ticketIds: string[];
  count: number;
  summary: string;
  likelyCause: string | null;
  nextStep: string | null;
  caveats: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  note: string;
}

export interface Tier2Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number | null;
}

export interface TriageStats {
  tickets: number;
  tier1Calls: number;
  inputTokens: number;
  avgLatencyMs: number | null;
  lanes: Record<string, number>;
  patterns: number;
  errors: number;
  tier2: { light: Tier2Usage; heavy: Tier2Usage };
}

export interface TriageResult {
  ok: true;
  mode: "live" | "fixture";
  telco: string;
  synthetic: true;
  batchLabel: string;
  generatedAt: string;
  tickets: TicketResult[];
  patterns: Pattern[];
  analyses: ClusterAnalysis[];
  humanQueue: { id: string; reasons: string[]; summary: string | null }[];
  brief: string;
  stats: TriageStats;
}

export interface Health {
  ok: true;
  service: string;
  mode: "live" | "fixture";
  configured: boolean;
}

export interface Batch {
  ok: true;
  telco: string;
  synthetic: true;
  batchLabel: string;
  tickets: Ticket[];
}