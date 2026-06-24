import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Broadcast = {
  id: string; title: string; body: string; scope: string; requireAck: boolean; createdAt: string;
  acked: boolean; canManage: boolean; stats?: { recipients: number; acked: number };
};

export function useBroadcasts() {
  return useQuery({ queryKey: ["broadcasts"], queryFn: () => api<{ items: Broadcast[]; canSendOrg: boolean }>("/api/broadcasts") });
}
export function useBroadcastPending() {
  return useQuery({ queryKey: ["broadcasts-pending"], queryFn: () => api<{ count: number }>("/api/broadcasts/pending"), refetchInterval: 60_000 });
}
export function useSendBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKind: "ALL" | "NODE"; scopeId?: string | null; title: string; body: string; requireAck?: boolean }) => api<{ id: string }>("/api/broadcasts", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["broadcasts"] }); qc.invalidateQueries({ queryKey: ["broadcasts-pending"] }); },
  });
}
export function useAckBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/broadcasts/${id}/ack`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["broadcasts"] }); qc.invalidateQueries({ queryKey: ["broadcasts-pending"] }); },
  });
}
export function useDeleteBroadcast() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/broadcasts/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }) });
}
