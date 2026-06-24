// Curated allow-list of cheap-but-good models per provider, with rough $/1M-token prices used only to
// ESTIMATE cost in the dashboard (clearly labelled "estimated"). Prices drift — update here when needed.
export type ModelInfo = { provider: "anthropic" | "openai" | "gemini"; model: string; label: string; inUsd: number; outUsd: number };

export const MODELS: ModelInfo[] = [
  { provider: "anthropic", model: "claude-haiku-4-5", label: "Claude Haiku 4.5 (cheap)", inUsd: 1.0, outUsd: 5.0 },
  { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (capable)", inUsd: 3.0, outUsd: 15.0 },
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini (cheap)", inUsd: 0.15, outUsd: 0.6 },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o (capable)", inUsd: 2.5, outUsd: 10.0 },
  { provider: "gemini", model: "gemini-1.5-flash", label: "Gemini 1.5 Flash (very cheap)", inUsd: 0.075, outUsd: 0.3 },
  { provider: "gemini", model: "gemini-1.5-pro", label: "Gemini 1.5 Pro (capable)", inUsd: 1.25, outUsd: 5.0 },
];

export const modelInfo = (model: string) => MODELS.find((m) => m.model === model);
export const estimateCost = (model: string, tokensIn: number, tokensOut: number) => {
  const m = modelInfo(model);
  if (!m) return 0;
  return (tokensIn / 1e6) * m.inUsd + (tokensOut / 1e6) * m.outUsd;
};
