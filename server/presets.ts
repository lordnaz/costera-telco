// Pre-configured reviewer presets. Each preset resolves its key and endpoint
// server-side from its own env pair; the browser only ever receives model names
// and the decision engine. Presets are temporary reviewer opt-ins, retired after
// the bounty review; bring-your-own session access remains the permanent path.

import { DECISION_MODEL } from "./decision.ts";
import type { EnvReader } from "./decision.ts";
import { FLASH_MODEL, MAX_MODEL } from "./tier2.ts";

export type PresetId = "qwen" | "ilmu";
export const PRESET_IDS: PresetId[] = ["qwen", "ilmu"];
export const isPresetId = (v: unknown): v is PresetId => v === "qwen" || v === "ilmu";

export interface PresetInfo {
  available: boolean;
  models: { decision: string; flash: string; max: string } | null;
  decisionEngine: "systemone" | "chat";
}

export interface PresetSetup {
  keyVar: string;
  baseVar: string;
  modelVar: (tier: string) => string;
  defaults: { decision: string; flash: string; max: string };
  engine: (env: EnvReader) => "systemone" | "chat";
}

export const PRESET_SETUP: Record<PresetId, PresetSetup> = {
  qwen: {
    keyVar: "COSTERA_API_KEY",
    baseVar: "COSTERA_API_BASE_URL",
    modelVar: (t) => `COSTERA_MODEL_${t.toUpperCase()}`,
    defaults: { decision: DECISION_MODEL, flash: FLASH_MODEL, max: MAX_MODEL },
    engine: (env) => (env("COSTERA_DECISION_ENGINE") === "chat" ? "chat" : "systemone"),
  },
  ilmu: {
    keyVar: "COSTERA_ILMU_API_KEY",
    baseVar: "COSTERA_ILMU_API_BASE_URL",
    modelVar: (t) => `COSTERA_ILMU_MODEL_${t.toUpperCase()}`,
    defaults: { decision: "ilmu-mini-v3.3", flash: "ilmu-glm-5.3-flash", max: "ilmu-glm-5.3" },
    engine: () => "chat",
  },
};

// Availability + model names only. The key and endpoint hostname never leave the server.
export function presetInfo(env: EnvReader, id: PresetId): PresetInfo {
  const s = PRESET_SETUP[id];
  const available = Boolean(env(s.keyVar) && env(s.baseVar));
  return {
    available,
    models: available
      ? {
          decision: env(s.modelVar("decision")) || s.defaults.decision,
          flash: env(s.modelVar("flash")) || s.defaults.flash,
          max: env(s.modelVar("max")) || s.defaults.max,
        }
      : null,
    decisionEngine: s.engine(env),
  };
}