import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type LegalDoc = { body: string; version: number; accepted: boolean };
export type Legal = { docs: { TOS: LegalDoc | null; PRIVACY: LegalDoc | null }; pending: string[] };
export const LEGAL_TITLES: Record<string, string> = { TOS: "Terms of Service", PRIVACY: "Privacy Policy" };

export function useLegal(enabled = true) {
  return useQuery({ queryKey: ["legal"], enabled, queryFn: () => api<Legal>("/api/legal") });
}
export function useAcceptLegal() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (kind: string) => api("/api/legal/accept", { method: "POST", body: JSON.stringify({ kind }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["legal"] }) });
}
export function useSaveLegal() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { kind: string; body: string }) => api(`/api/legal/${v.kind}`, { method: "PUT", body: JSON.stringify({ body: v.body }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["legal"] }) });
}
