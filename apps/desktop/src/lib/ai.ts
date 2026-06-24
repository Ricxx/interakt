import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type AiModel = { provider: string; model: string; label: string; inUsd: number; outUsd: number };
export type AiSettings = { enabled: boolean; provider: string; model: string; keySet: boolean; weeklyTokenCap: number; perUserDailyCap: number; models: AiModel[] };
export type AiUsage = {
  enabled: boolean; configured: boolean; model: string; provider: string;
  weeklyTokenCap: number; weekTokens: number; weekPct: number; weekCost: number; monthCost: number;
  byFeature: { feature: string; tokens: number; cost: number }[];
  byModel: { model: string; tokens: number; cost: number }[];
  topUsers: { name: string; tokens: number; cost: number }[];
};

export function useAiStatus() {
  return useQuery({ queryKey: ["ai-status"], queryFn: () => api<{ available: boolean }>("/api/ai/status") });
}
export function useAiSettings() {
  return useQuery({ queryKey: ["ai-settings"], queryFn: () => api<AiSettings>("/api/ai/settings") });
}
export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<{ enabled: boolean; provider: string; model: string; apiKey: string; weeklyTokenCap: number; perUserDailyCap: number }>) => api("/api/ai/settings", { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-settings"] }); qc.invalidateQueries({ queryKey: ["ai-status"] }); qc.invalidateQueries({ queryKey: ["ai-usage"] }); },
  });
}
export function useAiUsage() {
  return useQuery({ queryKey: ["ai-usage"], queryFn: () => api<AiUsage>("/api/ai/usage") });
}
export function useAskAssistant() {
  return useMutation({ mutationFn: (question: string) => api<{ answer: string; tokensIn: number; tokensOut: number }>("/api/ai/assistant", { method: "POST", body: JSON.stringify({ question }) }) });
}
