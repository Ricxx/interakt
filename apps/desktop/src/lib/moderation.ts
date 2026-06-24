import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Report = { id: string; kind: "PHOTO" | "SUGGESTION"; refId: string; reason: string | null; by: string; at: string; preview: string; caption: string; hidden: boolean };

export function useReports() {
  return useQuery({ queryKey: ["reports"], queryFn: () => api<{ items: Report[]; canModerate: boolean }>("/api/reports") });
}
export function useReportCount() {
  return useQuery({ queryKey: ["reports-count"], queryFn: () => api<{ count: number; canModerate: boolean }>("/api/reports/count"), refetchInterval: 60_000 });
}
export function useReportContent() {
  return useMutation({
    mutationFn: (v: { kind: "PHOTO" | "SUGGESTION"; refId: string; reason?: string }) => api<{ ok: boolean; already?: boolean }>("/api/reports", { method: "POST", body: JSON.stringify(v) }),
  });
}
export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; action: "HIDE" | "DISMISS" }) => api(`/api/reports/${v.id}/resolve`, { method: "POST", body: JSON.stringify({ action: v.action }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); qc.invalidateQueries({ queryKey: ["reports-count"] }); },
  });
}
