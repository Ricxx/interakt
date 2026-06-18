import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type WellnessAgg = { count: number; avg?: number; locked?: boolean };
export type WellnessTrendPoint = { weeksAgo: number } & WellnessAgg;
export type WellnessPortal = { k: number; windowDays: number; overall: WellnessAgg; departments: ({ name: string } & WellnessAgg)[]; trend: WellnessTrendPoint[] };

export function useWellnessCheckin() {
  return useMutation({ mutationFn: (v: { stress: number; note?: string }) => api("/api/wellness/checkin", { method: "POST", body: JSON.stringify(v) }) });
}
export function useWellnessPortal(enabled: boolean) {
  return useQuery({ queryKey: ["wellness"], queryFn: () => api<WellnessPortal>("/api/wellness"), enabled });
}

// --- W3: institution support content ---
export type WellnessResource = { id: string; title: string; body: string | null; url: string | null; email: string | null; whatsapp: string | null; published: boolean; sortOrder: number };
export type ResourceInput = { title: string; body?: string; url?: string; email?: string; whatsapp?: string; published?: boolean; sortOrder?: number };

export function useWellnessResources() {
  return useQuery({ queryKey: ["wellness-resources"], queryFn: () => api<{ canManage: boolean; resources: WellnessResource[] }>("/api/wellness/resources") });
}
export function useSaveResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; data: ResourceInput }) =>
      api(v.id ? `/api/wellness/resources/${v.id}` : "/api/wellness/resources", { method: v.id ? "PATCH" : "POST", body: JSON.stringify(v.data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wellness-resources"] }),
  });
}
export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/wellness/resources/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wellness-resources"] }),
  });
}

// --- Personal, on-device wellness (NEVER sent to the server — keeps check-ins anonymous) ---
// We track the person's own recent moods locally so we can privately nudge self-care.
const HIST_KEY = "ces-wellness-history";
type Entry = { stress: number; day: string };
const dayAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

function readHistory(): Entry[] {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) ?? "[]"); } catch { return []; }
}
export function recordLocalCheckin(stress: number) {
  const hist = [...readHistory(), { stress, day: new Date().toISOString().slice(0, 10) }].filter((e) => e.day >= dayAgo(60)).slice(-100);
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
}
// "Rough stretch" = several high-stress check-ins in the last two weeks → suggest a day off.
export function personalGuidance(): { rough: boolean; recentHigh: number } {
  const recent = readHistory().filter((e) => e.day >= dayAgo(14));
  const recentHigh = recent.filter((e) => e.stress >= 4).length;
  return { rough: recentHigh >= 3, recentHigh };
}

const QUOTES = [
  "Rest is productive too.",
  "You don't have to do it all today.",
  "Small steps still move you forward.",
  "It's okay to ask for help.",
  "Your worth isn't measured by your output.",
  "Take the break before you need it.",
  "Progress, not perfection.",
  "Be as kind to yourself as you are to others.",
  "One thing at a time.",
  "You've handled hard days before — you'll handle this one too.",
  "Breathe. You're doing better than you think.",
  "Done is better than perfect.",
];
export const randomQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];
