import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type SuggestionKind = "SUGGESTION" | "COMPLAINT";
export type SuggestionStatus = "NEW" | "REVIEWING" | "PLANNED" | "DONE" | "DECLINED";
export type Suggestion = { id: string; kind: SuggestionKind; body: string; status: SuggestionStatus; urgent: boolean; category: string | null; response: string | null; scope: string; createdDay: string; updatedDay: string | null; canManage: boolean; votes: number; myVote: boolean };
export type Claimed = { id: string; kind: SuggestionKind; body: string; status: SuggestionStatus; response: string | null; createdDay: string; updatedDay: string | null };
export type ComplaintCategory = { key: string; label: string };
export type ComplaintRoute = { category: string; nodeId: string; nodeName: string };

export function useComplaintRoutes() {
  return useQuery({ queryKey: ["complaint-routes"], queryFn: () => api<{ categories: ComplaintCategory[]; routes: ComplaintRoute[] }>("/api/suggestions/routes") });
}
export function useSetComplaintRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { category: string; nodeId: string }) => api(`/api/suggestions/routes/${v.category}`, { method: "PUT", body: JSON.stringify({ nodeId: v.nodeId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaint-routes"] }),
  });
}
export function useClearComplaintRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: string) => api(`/api/suggestions/routes/${category}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaint-routes"] }),
  });
}

export function useSuggestions() {
  return useQuery({ queryKey: ["suggestions"], queryFn: () => api<{ suggestions: Suggestion[] }>("/api/suggestions") });
}
export function useSubmitSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: SuggestionKind; body: string; scopeKind: "ALL" | "NODE"; scopeId?: string | null; urgent?: boolean; category?: string }) => api<{ id: string; ticket: string }>("/api/suggestions", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suggestions"] }); qc.invalidateQueries({ queryKey: ["suggestions-urgent"] }); },
  });
}
export function useUrgentCount() {
  return useQuery({ queryKey: ["suggestions-urgent"], queryFn: () => api<{ count: number }>("/api/suggestions/urgent-count"), refetchInterval: 60_000 });
}
export function useVoteSuggestion() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/suggestions/${id}/vote`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }) });
}
export function useManageSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status?: SuggestionStatus; response?: string | null }) => api(`/api/suggestions/${v.id}`, { method: "PATCH", body: JSON.stringify({ status: v.status, response: v.response }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suggestions"] }); qc.invalidateQueries({ queryKey: ["suggestions-urgent"] }); },
  });
}
export function useClaim() {
  return useMutation({ mutationFn: (v: { id: string; ticket: string }) => api<Claimed>(`/api/suggestions/${v.id}/claim`, { method: "POST", body: JSON.stringify({ ticket: v.ticket }) }) });
}
