import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Retention = { enabled: boolean; complaintsResolvedMonths: number; wellnessRawDays: number; deactivatedPiiDays: number; lastRunAt: string | null };

export function useRetention() {
  return useQuery({ queryKey: ["retention"], queryFn: () => api<Retention>("/api/retention") });
}
export function useSaveRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<Retention>) => api("/api/retention", { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retention"] }),
  });
}
export function useRunRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ complaints: number; wellness: number; erased: number }>("/api/retention/run", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["retention"] }); qc.invalidateQueries({ queryKey: ["members"] }); },
  });
}
