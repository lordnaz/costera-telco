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

export interface TriageStats {
  tickets: number;
  tier1Calls: number;
  inputTokens: number;
  avgLatencyMs: number | null;
  lanes: Record<string, number>;
  patterns: number;
  errors: number;
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
  humanQueue: { id: string; reasons: string[] }[];
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