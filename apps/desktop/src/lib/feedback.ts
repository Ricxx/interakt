import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type BugReport = { id: string; kind: "BUG" | "IDEA"; message: string; page: string | null; status: "NEW" | "FORWARDED" | "CLOSED"; at: string; by: string };

export function useSubmitBug() {
  return useMutation({ mutationFn: (v: { kind: "BUG" | "IDEA"; message: string; page?: string }) => api("/api/bug-reports", { method: "POST", body: JSON.stringify(v) }) });
}
export function useBugReports() {
  return useQuery({ queryKey: ["bug-reports"], queryFn: () => api<{ items: BugReport[] }>("/api/bug-reports") });
}
export function useBugCount() {
  return useQuery({ queryKey: ["bug-count"], queryFn: () => api<{ count: number; canView: boolean }>("/api/bug-reports/count"), refetchInterval: 120_000 });
}
export function useHandleBug() {
  const qc = useQueryClient();
  const inval = () => { qc.invalidateQueries({ queryKey: ["bug-reports"] }); qc.invalidateQueries({ queryKey: ["bug-count"] }); };
  return {
    forward: useMutation({ mutationFn: (id: string) => api<{ emailed: boolean }>(`/api/bug-reports/${id}/forward`, { method: "POST" }), onSuccess: inval }),
    close: useMutation({ mutationFn: (id: string) => api(`/api/bug-reports/${id}/close`, { method: "POST" }), onSuccess: inval }),
  };
}
