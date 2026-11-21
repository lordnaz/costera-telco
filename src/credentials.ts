// Session-only bring-your-own API access. Values live in React memory for this page
// load only: never localStorage, never sessionStorage, never the repo, never logs.
// A refresh clears them and the reviewer must enter them again.

export type TierId = "decision" | "flash" | "max";

export const TIERS: { id: TierId; label: string; model: string }[] = [
  { id: "decision", label: "Tier 1 classifier", model: "decision-model-preview" },
  { id: "flash", label: "Tier 2 light", model: "qwen3.8-flash" },
  { id: "max", label: "Tier 2 heavy", model: "qwen3.8-max" },
];

export interface TierEntry {
  key: string;
  baseUrl: string;
  model: string;
}

export interface SessionCreds {
  baseUrl: string;
  key: string;
  decisionEngine: "systemone" | "chat";
  tiers: Record<TierId, TierEntry>;
}

export const emptyCreds = (): SessionCreds => ({
  baseUrl: "",
  key: "",
  decisionEngine: "chat",
  tiers: {
    decision: { key: "", baseUrl: "", model: "" },
    flash: { key: "", baseUrl: "", model: "" },
    max: { key: "", baseUrl: "", model: "" },
  },
});

export const effective = (c: SessionCreds, t: TierId): TierEntry => ({
  key: (c.tiers[t].key || c.key).trim(),
  baseUrl: (c.tiers[t].baseUrl || c.baseUrl).trim(),
  model: c.tiers[t].model.trim(),
});

// Empty means "no selection" — the reviewer must choose a model explicitly.
export const effectiveModel = (c: SessionCreds, t: TierId): string => effective(c, t).model;

// What the Settings page currently holds per lane, for readouts before any run exists.
export const sessionModels = (c: SessionCreds) => ({
  decision: effectiveModel(c, "decision"),
  flash: effectiveModel(c, "flash"),
  max: effectiveModel(c, "max"),
});

export const sessionActive = (c: SessionCreds): boolean =>
  c.key.trim().length > 0 || TIERS.some((t) => c.tiers[t.id].key.trim().length > 0);

export const tierConfigured = (c: SessionCreds, t: TierId): boolean => {
  const e = effective(c, t);
  return e.key.length > 0 && e.baseUrl.startsWith("https://") && e.model.length > 0;
};

export const allTiersConfigured = (c: SessionCreds): boolean => TIERS.every((t) => tierConfigured(c, t.id));

export const decisionReady = (c: SessionCreds): boolean => {
  const e = effective(c, "decision");
  return e.key.length > 0 && e.baseUrl.startsWith("https://");
};

export const credentialsPayload = (c: SessionCreds) => {
  if (!sessionActive(c)) return null;
  const tier = (t: TierId) => ({
    key: c.tiers[t].key.trim(),
    baseUrl: c.tiers[t].baseUrl.trim(),
    model: c.tiers[t].model.trim(),
  });
  return {
    baseUrl: c.baseUrl.trim(),
    key: c.key.trim(),
    decisionEngine: c.decisionEngine,
    tiers: { decision: tier("decision"), flash: tier("flash"), max: tier("max") },
  };
};

// Temporary reviewer opt-in: the server resolves key+endpoint from its own environment.
// The browser sends model choices only — never a key, never a URL.
export type PresetId = "qwen" | "ilmu";

export interface PresetAccessInfo {
  available: boolean;
  models: { decision: string; flash: string; max: string } | null;
  decisionEngine: "systemone" | "chat";
}

export interface DemoAccessInfo extends PresetAccessInfo {
  ok: boolean;
  ilmu: PresetAccessInfo;
}

export const demoCredentialsPayload = (
  models: { decision: string; flash: string; max: string },
  engine: "systemone" | "chat",
  provider: PresetId = "qwen",
) => ({
  demoAccess: true,
  demoProvider: provider,
  credentials: {
    baseUrl: "",
    key: "",
    decisionEngine: engine,
    tiers: {
      decision: { key: "", baseUrl: "", model: models.decision },
      flash: { key: "", baseUrl: "", model: models.flash },
      max: { key: "", baseUrl: "", model: models.max },
    },
  },
});