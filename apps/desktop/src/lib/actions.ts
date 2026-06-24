import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type ActionStatus = "COMMITTED" | "IN_PROGRESS" | "DONE";
export type ActionItem = { id: string; said: string; did: string; status: ActionStatus; scope: string; updatedAt: string; canManage: boolean };

export function useActions() {
  return useQuery({ queryKey: ["actions"], queryFn: () => api<{ items: ActionItem[]; canCreateOrg: boolean }>("/api/actions") });
}
export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKind: "ALL" | "NODE"; scopeId?: string | null; said: string; did: string; status?: ActionStatus }) => api<{ id: string }>("/api/actions", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}
export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; said?: string; did?: string; status?: ActionStatus }) => api(`/api/actions/${v.id}`, { method: "PATCH", body: JSON.stringify({ said: v.said, did: v.did, status: v.status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}
export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/actions/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }) });
}
