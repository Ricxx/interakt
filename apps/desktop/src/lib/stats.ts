import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

type Day = { day: string };
type Area = { surface: string; views: number; reach: number; reachPct: number };
export type Trend = { cur: number; prev: number; deltaPct: number | null };
export type Teams = { departments: { name: string; headcount: number; checkinRatePct: number; recognition: number; avgWellness: number | null }[] };
export type PersonStat = { id: string; name: string; jobTitle: string | null; dept: string | null; points: number; lastCheckin: string | null; checkins30: number; recognition: number; lastLogin: string | null; atRisk: boolean };
export type PeopleStats = { people: PersonStat[]; departments: string[] };

export type Overview = {
  generatedDay: string;
  level: "ALL" | "NODE";
  people: { active: number; checkedInToday: number; checkinRatePct: number; disabled: number };
  engagement: { wauPct: number; tiers: { today: number; week: number; month: number; dormant: number } };
  growth: { perDay: (Day & { count: number })[] };
  trends: { points: Trend; checkins: Trend; logins: Trend };
  atRisk: { count: number; pct: number; sample: string[] };
  warnings: { key: string; label: string; level: "ok" | "warn" | "alert"; value: string; hint: string }[];
  points: { generated: number; spent: number; outstanding: number; perDay: (Day & { generated: number; spent: number })[] };
  checkins: { perDay: (Day & { count: number; ratePct: number })[] };
  logins: { perDay: (Day & { success: number; failed: number })[] };
  sessions: { total: number; held: number; live: number; participants: number; perDay: (Day & { count: number })[] };
  topAreas: Area[];
};
export type Engagement = {
  byArea: Area[];
  topItems: { surface: string; title: string; views: number; reach: number; reachPct: number }[];
  logins: { success30: number; failed30: number; distinctUsers30: number; perDay: (Day & { success: number; failed: number })[] };
};
export type Programs = {
  recognition: { total: number; last30: number; likes: number; coveragePct: number; giverPct: number; byBadge: { badge: string; n: number }[]; byKind: { kind: string; n: number }[]; topRecipients: { name: string; n: number }[]; perDay: (Day & { count: number })[]; perWeek: { week: string; count: number }[] };
  wellness: { count30: number; avgStress: number | null; distribution: { stress: number; n: number }[]; trend: { week: string; avgStress: number | null; locked: boolean }[]; checkinsPerWeek: { week: string; count: number }[] };
  surveys: { title: string; status: string; views: number; started: number; completed: number; completionPct: number; avgProgressPct: number }[];
};
export type Content = {
  quizzes: { title: string; players: number; avgScorePct: number; winner: { name: string; points: number } | null }[];
  boards: { posts: number; comments: number; topPosts: { title: string; comments: number }[] };
  tasks: { created: number; completed: number; perDay: (Day & { created: number; completed: number })[] };
  lists: { open: number; items: number; done: number; donePct: number };
  announcements: { title: string; requireAck: boolean; recipients: number; seen: number; seenPct: number; acked: number; ackPct: number }[];
  shop: { redeemed: number; pointsSpent: number; participationPct: number; byItem: { name: string; count: number; spent: number }[]; views: { name: string; views: number }[] };
  requests: { total: number; pending: number; perDay: (Day & { count: number })[] };
  events: { total: number; fundraisers: number; contributed: number; photos: number };
  tournaments: { total: number; champions: { title: string; game: string | null; winner: string | null }[] };
  achievements: { awarded: number; top: { name: string; icon: string | null; n: number }[] };
  activities: { type: string; n: number }[];
  feedback: { suggestions: number; complaints: number; open: number; perDay: (Day & { count: number })[]; complaintsPerWeek: { week: string; count: number }[]; adoptionPct: number; avgResolutionDays: number | null; byCategory: { category: string; n: number }[] };
};

export function useStatsAccess() { return useQuery({ queryKey: ["stats", "access"], queryFn: () => api<{ canView: boolean; level: "ALL" | "NODE" | null }>("/api/stats/access") }); }
export function useOverview() { return useQuery({ queryKey: ["stats", "overview"], queryFn: () => api<Overview>("/api/stats") }); }
export function useEngagement(on: boolean) { return useQuery({ queryKey: ["stats", "engagement"], enabled: on, queryFn: () => api<Engagement>("/api/stats/engagement") }); }
export function usePrograms(on: boolean) { return useQuery({ queryKey: ["stats", "programs"], enabled: on, queryFn: () => api<Programs>("/api/stats/programs") }); }
export function useContent(on: boolean) { return useQuery({ queryKey: ["stats", "content"], enabled: on, queryFn: () => api<Content>("/api/stats/content") }); }
export function useTeams(on: boolean) { return useQuery({ queryKey: ["stats", "teams"], enabled: on, queryFn: () => api<Teams>("/api/stats/teams") }); }
export function useStatsPeople(on: boolean) { return useQuery({ queryKey: ["stats", "people"], enabled: on, queryFn: () => api<PeopleStats>("/api/stats/people") }); }

// Fire-and-forget tracking — never blocks or breaks the app. refId records a specific item viewed.
export function trackView(surface: string, refId?: string) {
  api("/api/stats/track", { method: "POST", body: JSON.stringify({ surface, refId }) }).catch(() => {});
}

function save(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Download the full statistics report as a JSON file.
export async function downloadReport() {
  const res = await fetch("/api/stats/export", { credentials: "include" });
  if (!res.ok) return;
  save(JSON.stringify(await res.json(), null, 2), `ces-statistics-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}

// Download the daily metrics as a spreadsheet-friendly CSV (one row per day).
export async function downloadCsv() {
  const res = await fetch("/api/stats/export", { credentials: "include" });
  if (!res.ok) return;
  const r = (await res.json()) as { overview: Overview };
  const o = r.overview;
  const by = (arr: any[], k: string) => new Map(arr.map((x) => [x.day, x[k]]));
  const pg = by(o.points.perDay, "generated"), ps = by(o.points.perDay, "spent");
  const ci = by(o.checkins.perDay, "count"), cr = by(o.checkins.perDay, "ratePct");
  const lo = by(o.logins.perDay, "success"), lf = by(o.logins.perDay, "failed");
  const se = by(o.sessions.perDay, "count"), gr = by(o.growth.perDay, "count");
  const head = ["date", "points_generated", "points_spent", "checkins", "checkin_rate_pct", "logins", "failed_logins", "sessions", "new_members"];
  const rows = o.points.perDay.map((d) => [d.day, pg.get(d.day), ps.get(d.day), ci.get(d.day), cr.get(d.day), lo.get(d.day), lf.get(d.day), se.get(d.day), gr.get(d.day)].join(","));
  save([head.join(","), ...rows].join("\n"), `ces-statistics-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
}
