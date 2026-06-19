import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Points = { balance: number; streak: number; checkedInToday: boolean; lotteryToday: boolean; recent: { delta: number; reason: string; day: string }[] };

export function usePoints() {
  return useQuery({ queryKey: ["points"], queryFn: () => api<Points>("/api/points/me") });
}
export function useCheckin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api<{ awarded?: number; streak: number; balance: number; prize?: { kind: string; label: string } | null }>("/api/points/checkin", { method: "POST" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["points"] }); qc.invalidateQueries({ queryKey: ["points-cal"] }); } });
}
export function useLottery() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api<{ won?: number; already?: boolean; balance: number }>("/api/points/lottery", { method: "POST" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["points"] }); qc.invalidateQueries({ queryKey: ["market"] }); } });
}
export function useToggleLeave() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (day?: string) => api<{ onLeave: boolean }>("/api/points/leave", { method: "POST", body: JSON.stringify({ day }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["points"] }); qc.invalidateQueries({ queryKey: ["points-cal"] }); } });
}

export type CalReward = { day: string; kind: "POINTS" | "PRIZE" | "TITLE" | "PROFILE"; label: string; points: number };
export type Calendar = { month: string; today: string; balance: number; streak: number; checkedInToday: boolean; canManage: boolean; checkins: string[]; rewards: CalReward[] };

export function useCalendar(month: string) {
  return useQuery({ queryKey: ["points-cal", month], queryFn: () => api<Calendar>(`/api/points/calendar?month=${month}`) });
}
export function useSetReward(month: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { day: string; kind: string; label: string; points?: number }) => api(`/api/points/rewards/${v.day}`, { method: "PUT", body: JSON.stringify({ kind: v.kind, label: v.label, points: v.points }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["points-cal", month] }) });
}
export function useClearReward(month: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (day: string) => api(`/api/points/rewards/${day}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["points-cal", month] }) });
}
