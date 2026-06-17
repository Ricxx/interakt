import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type AuditEntry = { id: number; action: string; meta: Record<string, unknown> | null; at: string; actorName: string };

export function useAuditLog() {
  return useQuery({ queryKey: ["audit"], queryFn: () => api<{ entries: AuditEntry[] }>("/api/audit?limit=200") });
}
export function useAuditVerify() {
  return useQuery({ queryKey: ["audit-verify"], queryFn: () => api<{ ok: boolean; count: number; brokenAtId?: number }>("/api/audit/verify") });
}

export async function downloadAuditCsv() {
  const res = await fetch("/api/audit/export", { credentials: "include" });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit-log.csv";
  a.click();
  URL.revokeObjectURL(url);
}
