import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const METRICS: { key: string; label: string }[] = [
  { key: "BIGUPS_RECEIVED", label: "Big-ups received" },
  { key: "BIGUPS_GIVEN", label: "Big-ups given" },
  { key: "GAMES_WON", label: "Games won (tournaments)" },
  { key: "CHECKIN_STREAK", label: "Check-in streak" },
  { key: "CHECKINS", label: "Check-ins" },
];
export const metricLabel = (k: string) => METRICS.find((m) => m.key === k)?.label ?? k;

export type AchStatus = "ACTIVE" | "UPCOMING" | "ENDED";
export type AchievementDef = { id: string; name: string; description: string | null; category: string | null; icon: string | null; metric: string; threshold: number; period: string; scope: string; status: AchStatus; activeFrom: string | null; activeUntil: string | null; scopeKind?: "ALL" | "NODE" | "GROUP"; scopeId?: string | null };
export type MyAchievement = AchievementDef & { value: number; earned: boolean; awardedAt: string | null };
export type Earned = { name: string; icon: string | null; category: string | null };
export type DefInput = { name: string; description?: string; category?: string; icon?: string; metric: string; threshold: number; period: string; scopeKind?: "ALL" | "NODE" | "GROUP"; scopeId?: string | null; activeFrom?: string | null; activeUntil?: string | null };

export function useAchievementDefs() {
  return useQuery({ queryKey: ["achievement-defs"], queryFn: () => api<{ canManage: boolean; achievements: AchievementDef[] }>("/api/achievements") });
}
export function useMyAchievements() {
  return useQuery({ queryKey: ["achievements-me"], queryFn: () => api<{ achievements: MyAchievement[] }>("/api/achievements/me") });
}
export function useSaveAchievement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; data: DefInput }) => api(v.id ? `/api/achievements/${v.id}` : "/api/achievements", { method: v.id ? "PATCH" : "POST", body: JSON.stringify(v.data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["achievement-defs"] }); qc.invalidateQueries({ queryKey: ["achievements-me"] }); },
  });
}
export function useDeleteAchievement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/achievements/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["achievement-defs"] }); qc.invalidateQueries({ queryKey: ["achievements-me"] }); },
  });
}
