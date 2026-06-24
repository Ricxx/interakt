import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type TenantSettings = { name: string; timezone: string; registrationMode: string; usageLogEnabled: boolean; profilePicsEnabled: boolean; disabledModules: string[]; brandColor: string; brandEmoji: string | null; brandLogoUrl: string | null; welcomeMessage: string | null; terms: Record<string, string>; footerCredit: boolean };

// Accent palette: key → label + hue. Keys mirror BRAND_COLORS on the server. The hue feeds
// --brand-hue; lightness/saturation are fixed in index.css so contrast holds in light & dark.
export const BRAND_COLORS: { key: string; label: string; hue: number }[] = [
  { key: "blue", label: "Blue", hue: 222 }, { key: "indigo", label: "Indigo", hue: 245 }, { key: "violet", label: "Violet", hue: 270 },
  { key: "emerald", label: "Emerald", hue: 158 }, { key: "teal", label: "Teal", hue: 185 }, { key: "rose", label: "Rose", hue: 345 },
  { key: "amber", label: "Amber", hue: 35 }, { key: "crimson", label: "Crimson", hue: 350 }, { key: "slate", label: "Slate", hue: 215 },
];
export const brandHue = (key: string) => BRAND_COLORS.find((c) => c.key === key)?.hue ?? 222;
// Apply an accent across the whole app by overriding the single --brand-hue token.
export function applyBrandColor(key: string) {
  document.documentElement.style.setProperty("--brand-hue", String(brandHue(key)));
}

// Feature areas an org can hide from the nav (key → label). Keep in sync with TOGGLEABLE_MODULES on the server.
export const TOGGLEABLE_MODULES: { key: string; label: string }[] = [
  { key: "quizzes", label: "Quizzes" }, { key: "tournaments", label: "Tournaments" }, { key: "scoreboards", label: "Scoreboards" },
  { key: "recognition", label: "Recognition" }, { key: "highlights", label: "Highlights" }, { key: "achievements", label: "Achievements" }, { key: "shop", label: "Shop" },
  { key: "boards", label: "Boards" }, { key: "repository", label: "Repository" }, { key: "lists", label: "Lists" }, { key: "surveys", label: "Surveys" },
  { key: "tasks", label: "To-do" }, { key: "events", label: "Events" }, { key: "calendar", label: "Calendar" }, { key: "wellness", label: "Wellness" },
  { key: "directory", label: "Directory" }, { key: "suggestions", label: "Suggestions" }, { key: "actions", label: "You said → We did" }, { key: "announcements", label: "Announcements" },
];

export function useTenantSettings() {
  return useQuery({ queryKey: ["tenant-settings"], queryFn: () => api<TenantSettings>("/api/tenant/settings") });
}

// White-label vocabulary. Keys are fixed; defaults apply until an admin overrides them in Settings.
export const TERM_DEFAULTS: Record<string, string> = { points: "point", pointsPlural: "points", recognition: "Recognition", session: "session", sessionPlural: "sessions" };
export const TERM_LABELS: Record<string, string> = { points: "Points — singular", pointsPlural: "Points — plural", recognition: "Recognition (the feature)", session: "Session — singular", sessionPlural: "Session — plural" };
export function useTerms() {
  const { data } = useTenantSettings();
  const o = data?.terms ?? {};
  // term(key, capitalize?) → the org's word (or the default).
  return (key: keyof typeof TERM_DEFAULTS, cap = false) => {
    const v = (o[key]?.trim() || TERM_DEFAULTS[key]) ?? key;
    return cap ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  };
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
export function useSetModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (disabledModules: string[]) => api("/api/tenant/settings", { method: "PATCH", body: JSON.stringify({ disabledModules }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-settings"] }),
  });
}
export function useSetBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name?: string; brandColor?: string; brandEmoji?: string | null; footerCredit?: boolean; brandLogoUrl?: string | null; welcomeMessage?: string | null; terms?: Record<string, string> }) => api("/api/tenant/settings", { method: "PATCH", body: JSON.stringify(v) }),
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
