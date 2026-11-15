// Curated popular-model catalog for the demo dropdowns. Rates are ASSUMED proxies
// (USD per million tokens, in/out) so routed-vs-flagship comparisons stay honest;
// every figure derived from them is labelled an estimate, not billing truth.

export type ModelRole = "light" | "mid" | "flagship";

export interface CatalogModel {
  id: string;
  name?: string;
  family: string;
  role: ModelRole;
  in: number;
  out: number;
  classifierOnly?: boolean;
  recommended?: boolean;
}

export const MODELS: CatalogModel[] = [
  { id: "decision-model-preview", family: "Qwen MaaS", role: "light", in: 0.3, out: 0.6, classifierOnly: true, recommended: true },
  { id: "jeff", name: "JEFF", family: "Qwen MaaS", role: "light", in: 0.3, out: 0.6, classifierOnly: true },
  { id: "qwen3.8-flash", family: "Qwen", role: "light", in: 0.1, out: 0.4, recommended: true },
  { id: "qwen3.8-max", family: "Qwen", role: "flagship", in: 1.6, out: 6.4, recommended: true },
  { id: "deepseek-chat", family: "DeepSeek", role: "light", in: 0.28, out: 0.42 },
  { id: "deepseek-reasoner", family: "DeepSeek", role: "flagship", in: 0.55, out: 2.19 },
  { id: "gpt-6-mini", family: "OpenAI", role: "light", in: 0.25, out: 1.0 },
  { id: "gpt-6", family: "OpenAI", role: "flagship", in: 2.5, out: 10.0 },
  { id: "claude-haiku-4-5", family: "Anthropic", role: "light", in: 1.0, out: 5.0 },
  { id: "claude-sonnet-4-5", family: "Anthropic", role: "mid", in: 3.0, out: 15.0 },
  { id: "claude-opus-4-5", family: "Anthropic", role: "flagship", in: 5.0, out: 25.0 },
  { id: "kimi-k2", family: "Moonshot", role: "mid", in: 0.6, out: 2.5 },
  { id: "kimi-k2-thinking", family: "Moonshot", role: "flagship", in: 1.0, out: 4.0 },
];

export const DEFAULT_CHAT_CLASSIFIER = "deepseek-chat";

export const modelById = (id: string): CatalogModel | undefined => MODELS.find((m) => m.id === id);

export const isRecommended = (id: string): boolean => Boolean(modelById(id)?.recommended);

export const families = (list: CatalogModel[]): string[] => [...new Set(list.map((m) => m.family))];

// Tier 2 lists never include the classifier-only decision models.
export const DECISION_CONTRACT_OPTIONS = MODELS.filter((m) => m.classifierOnly);
export const LIGHT_OPTIONS = MODELS.filter((m) => !m.classifierOnly && (m.role === "light" || m.role === "mid"));
export const HEAVY_OPTIONS = MODELS.filter((m) => !m.classifierOnly && (m.role === "mid" || m.role === "flagship"));
export const CLASSIFIER_CHAT_OPTIONS = MODELS.filter((m) => !m.classifierOnly);

export interface RunModels {
  decision: string;
  flash: string;
  max: string;
}

export const DEFAULT_RUN_MODELS: RunModels = {
  decision: "decision-model-preview",
  flash: "qwen3.8-flash",
  max: "qwen3.8-max",
};
