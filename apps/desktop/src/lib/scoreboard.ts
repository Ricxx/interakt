import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Mode = "SOLO" | "TEAM";
export type ScoreboardListItem = { id: string; title: string; mode: Mode; entrants: number; leader: string | null; mine: boolean };
export type Standing = { id: string; name: string; total: number; perGame: Record<string, number>; rank: number };
export type Watcher = { id: string; name: string; entrantId: string | null };
export type ScoreboardDetail = { id: string; title: string; mode: Mode; canManage: boolean; games: string[]; standings: Standing[]; watchers: Watcher[] };

export function useScoreboards() {
  return useQuery({ queryKey: ["scoreboards"], queryFn: () => api<{ scoreboards: ScoreboardListItem[] }>("/api/scoreboards") });
}
export function useScoreboard(id: string) {
  return useQuery({ queryKey: ["scoreboard", id], queryFn: () => api<ScoreboardDetail>(`/api/scoreboards/${id}`), refetchInterval: 5000 });
}
export function useCreateScoreboard() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { title: string; mode: Mode }) => api<{ id: string }>("/api/scoreboards", { method: "POST", body: JSON.stringify(v) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["scoreboards"] }) });
}
const refetch = (qc: ReturnType<typeof useQueryClient>, id: string) => qc.invalidateQueries({ queryKey: ["scoreboard", id] });
export function useAddEntrant(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name: string) => api(`/api/scoreboards/${id}/entrants`, { method: "POST", body: JSON.stringify({ name }) }), onSuccess: () => refetch(qc, id) });
}
export function useRemoveEntrant(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (entrantId: string) => api(`/api/scoreboards/${id}/entrants/${entrantId}`, { method: "DELETE" }), onSuccess: () => refetch(qc, id) });
}
export function useRecordScore(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { entrantId: string; game?: string; points: number }) => api(`/api/scoreboards/${id}/scores`, { method: "POST", body: JSON.stringify(v) }), onSuccess: () => refetch(qc, id) });
}
export function useMoveWatcher(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { watcherId: string; entrantId: string | null }) => api(`/api/scoreboards/${id}/watchers/${v.watcherId}/move`, { method: "POST", body: JSON.stringify({ entrantId: v.entrantId }) }), onSuccess: () => refetch(qc, id) });
}
export function useRemoveWatcher(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (watcherId: string) => api(`/api/scoreboards/${id}/watchers/${watcherId}`, { method: "DELETE" }), onSuccess: () => refetch(qc, id) });
}
export function useScoreboardQrToken(id: string, enabled: boolean, join: boolean) {
  return useQuery({ queryKey: ["scoreboard-qr", id, join], queryFn: () => api<{ token: string; url: string; canJoin: boolean }>(`/api/scoreboards/${id}/qr-token${join ? "?join=1" : ""}`), enabled });
}
