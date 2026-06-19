import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type TenantSettings = { name: string; timezone: string; registrationMode: string; usageLogEnabled: boolean; profilePicsEnabled: boolean };

export function useTenantSettings() {
  return useQuery({ queryKey: ["tenant-settings"], queryFn: () => api<TenantSettings>("/api/tenant/settings") });
}
export function useSetTimezone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timezone: string) => api("/api/tenant/settings", { method: "PATCH", body: JSON.stringify({ timezone }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-settings"] }),
  });
}
export function useSetUsageLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (usageLogEnabled: boolean) => api("/api/tenant/settings", { method: "PATCH", body: JSON.stringify({ usageLogEnabled }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenant-settings"] }); qc.invalidateQueries({ queryKey: ["usage-access"] }); },
  });
}
export function useSetProfilePics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profilePicsEnabled: boolean) => api("/api/tenant/settings", { method: "PATCH", body: JSON.stringify({ profilePicsEnabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-settings"] }),
  });
}

// IANA zones from the runtime (Chromium webview supports this); fall back to a small list.
export function timezones(): string[] {
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (f) return f("timeZone");
  } catch { /* ignore */ }
  return ["UTC", "Africa/Johannesburg", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney"];
}
