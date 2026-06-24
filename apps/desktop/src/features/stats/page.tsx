import { useState } from "react";
import { useOverview, useEngagement, usePrograms, useContent, useTeams, useStatsPeople, downloadReport, downloadCsv, type Overview, type Engagement, type Programs, type Content, type Teams, type Trend, type PersonStat } from "../../lib/stats";
import { badgeOf } from "../../lib/recognition";
import { useOpenProfile } from "../profile/overlay";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const dl = (d: string) => d.slice(5);
const CAT_LABEL: Record<string, string> = { HARASSMENT: "Harassment/discrimination", PAY: "Pay & benefits", WORKLOAD: "Workload & wellbeing", MANAGEMENT: "Management", FACILITIES: "Facilities", SAFETY: "Health & safety", OTHER: "Other/uncategorised" };

function VBars({ data, unit = "", color = "bg-primary" }: { data: { label: string; value: number }[]; unit?: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-24 items-end gap-1">
      {data.map((d, i) => <div key={i} className="flex flex-1 items-end" title={`${d.label}: ${d.value}${unit}`}><div className={`w-full rounded-t ${color}`} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }} /></div>)}
    </div>
  );
}
function Series({ title, sub, data, unit, color }: { title: string; sub?: string; data: { label: string; value: number }[]; unit?: string; color?: string }) {
  return <Card><h3 className="text-sm font-semibold text-muted">{title}</h3>{sub && <p className="mb-2 text-xs text-muted/70">{sub}</p>}<VBars data={data} unit={unit} color={color} /></Card>;
}
function DeltaChip({ t, goodUp = true }: { t: Trend; goodUp?: boolean }) {
  if (t.deltaPct == null) return null;
  const up = t.deltaPct >= 0;
  const good = up === goodUp;
  return <span className={`ml-1 text-[11px] font-medium ${t.deltaPct === 0 ? "text-muted" : good ? "text-emerald-600" : "text-rose-600"}`}>{up ? "▲" : "▼"}{Math.abs(t.deltaPct)}%</span>;
}
function Kpi({ label, value, sub, delta }: { label: string; value: string | number; sub?: string; delta?: Trend }) {
  return <Card className="text-center"><div className="text-2xl font-semibold text-fg">{typeof value === "number" ? value.toLocaleString() : value}{delta && <DeltaChip t={delta} />}</div><div className="text-xs text-muted">{label}</div>{sub && <div className="mt-0.5 text-[11px] text-muted/70">{sub}</div>}</Card>;
}
function BarList({ rows }: { rows: { label: string; value: number; suffix?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1">
      {rows.length === 0 && <p className="text-xs text-muted">No data yet.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate" title={r.label}>{r.label}</span>
          <div className="h-2 flex-1 rounded-full bg-border"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          <span className="w-12 shrink-0 text-right text-muted">{r.value.toLocaleString()}{r.suffix ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

const ALL_TABS = ["Overview", "People", "Teams", "Engagement", "Programs", "Content"] as const;

export function StatisticsPage() {
  const [tab, setTab] = useState<typeof ALL_TABS[number]>("Overview");
  const { data: ov } = useOverview();
  const teamView = ov?.level === "NODE";
  const TABS = ALL_TABS.filter((t) => t !== "Teams" || !teamView); // dept comparison is org-wide only
  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between">
        <PageHeader title="Statistics" subtitle={teamView ? "Your team — engagement, reach and usage for the people and content you oversee." : "Whole organisation — engagement, reach and usage across every tool. Anonymous data is only ever counted or averaged over groups of 5+."} />
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => downloadCsv()}>⬇ CSV</Button>
          <Button variant="subtle" onClick={() => downloadReport()}>⬇ JSON</Button>
        </div>
      </div>
      {teamView && <p className="mb-3 -mt-3 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Scoped to your team</p>}
      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg"}`}>{t}</button>)}
      </div>
      {tab === "Overview" && <OverviewTab />}
      {tab === "People" && <PeopleTab />}
      {tab === "Teams" && <TeamsTab />}
      {tab === "Engagement" && <EngagementTab />}
      {tab === "Programs" && <ProgramsTab />}
      {tab === "Content" && <ContentTab />}
    </div>
  );
}

// Grouped early-warning signals — a quick "temperature check" of org health.
function TemperatureCheck({ warnings }: { warnings: Overview["warnings"] }) {
  if (!warnings.length) return null;
  const order = { alert: 0, warn: 1, ok: 2 } as const;
  const sorted = [...warnings].sort((a, b) => order[a.level] - order[b.level]);
  const alerts = warnings.filter((w) => w.level === "alert").length;
  const warns = warnings.filter((w) => w.level === "warn").length;
  const dot = { alert: "bg-rose-500", warn: "bg-amber-400", ok: "bg-emerald-400" };
  const text = { alert: "text-rose-600", warn: "text-amber-600", ok: "text-muted" };
  const headline = alerts ? `${alerts} need${alerts === 1 ? "s" : ""} attention` : warns ? `${warns} to watch` : "All clear 🎉";
  return (
    <Card className={alerts ? "border-rose-300/60" : warns ? "border-amber-300/50" : ""}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">🌡️ Temperature check</h2>
        <span className={`text-xs font-medium ${alerts ? "text-rose-600" : warns ? "text-amber-600" : "text-emerald-600"}`}>{headline}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((w) => (
          <div key={w.key} className="flex items-start gap-2 rounded-lg border border-border bg-bg/40 p-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[w.level]}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-fg">{w.label}</span>
                <span className={`text-sm font-semibold ${text[w.level]}`}>{w.value}</span>
              </div>
              <p className="text-[11px] text-muted/70">{w.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverviewTab() {
  const { data } = useOverview();
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const s: Overview = data;
  return (
    <div className="space-y-6">
      <TemperatureCheck warnings={s.warnings} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active members" value={s.people.active} />
        <Kpi label="Check-ins (14d)" value={s.trends.checkins.cur} sub={`${s.people.checkinRatePct}% checked in today`} delta={s.trends.checkins} />
        <Kpi label="Points earned (14d)" value={s.trends.points.cur} sub={`${s.points.outstanding.toLocaleString()} in circulation`} delta={s.trends.points} />
        <Kpi label="Logins (14d)" value={s.trends.logins.cur} delta={s.trends.logins} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Weekly active" value={`${s.engagement.wauPct}%`} sub="check-in or login in 7d" />
        <Kpi label="At-risk members" value={s.atRisk.count} sub={`${s.atRisk.pct}% — quiet 14d`} />
        <Kpi label="In-meeting reach" value={s.sessions.participants} sub="distinct joiners" />
        <Kpi label="New members (14d)" value={s.growth.perDay.reduce((a, d) => a + d.count, 0)} sub={`${s.people.disabled} disabled`} />
      </div>
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted">Engagement tiers</h3>
        <p className="mb-3 text-xs text-muted/70">Members by when they last checked in</p>
        <div className="flex h-4 overflow-hidden rounded-full bg-border text-[10px] font-semibold text-white">
          {[{ k: "today", n: s.engagement.tiers.today, c: "bg-emerald-500", l: "Today" }, { k: "week", n: s.engagement.tiers.week, c: "bg-emerald-400", l: "This week" }, { k: "month", n: s.engagement.tiers.month, c: "bg-amber-400", l: "This month" }, { k: "dormant", n: s.engagement.tiers.dormant, c: "bg-rose-400", l: "Dormant" }].map((t) => {
            const total = s.people.active || 1;
            return t.n > 0 ? <div key={t.k} className={`flex items-center justify-center ${t.c}`} style={{ width: `${(t.n / total) * 100}%` }} title={`${t.l}: ${t.n}`}>{(t.n / total) > 0.08 ? t.n : ""}</div> : null;
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Today {s.engagement.tiers.today}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />This week {s.engagement.tiers.week}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />This month {s.engagement.tiers.month}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Dormant {s.engagement.tiers.dormant}</span>
        </div>
      </Card>
      {s.atRisk.count > 0 && (
        <Card className="border-amber-300/60 bg-amber-50/30">
          <p className="text-sm text-fg">⚠ <b>{s.atRisk.count}</b> member{s.atRisk.count === 1 ? "" : "s"} ({s.atRisk.pct}%) haven't checked in or logged in for 14 days. See the <b>People</b> tab to find them and dig into individual stats.</p>
        </Card>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Series title="Points generated / day" sub="last 14 days" color="bg-emerald-400" data={s.points.perDay.map((d) => ({ label: dl(d.day), value: d.generated }))} />
        <Series title="Points spent / day" sub="last 14 days" color="bg-rose-400" data={s.points.perDay.map((d) => ({ label: dl(d.day), value: d.spent }))} />
        <Series title="Check-in rate / day" sub="% of members" unit="%" data={s.checkins.perDay.map((d) => ({ label: dl(d.day), value: d.ratePct }))} />
        <Series title="New members / day" sub="sign-ups, last 14 days" color="bg-teal-400" data={s.growth.perDay.map((d) => ({ label: dl(d.day), value: d.count }))} />
        <Series title="Sessions / day" sub="last 14 days" color="bg-violet-400" data={s.sessions.perDay.map((d) => ({ label: dl(d.day), value: d.count }))} />
        <Series title="Logins / day" sub="successful sign-ins" color="bg-sky-400" data={s.logins.perDay.map((d) => ({ label: dl(d.day), value: d.success }))} />
        <Card><h3 className="mb-2 text-sm font-semibold text-muted">Most-visited areas (30d)</h3><BarList rows={s.topAreas.map((a) => ({ label: a.surface, value: a.views }))} /></Card>
      </div>
    </div>
  );
}

function ago(d: string | null) {
  if (!d) return "never";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PeopleTab() {
  const { data } = useStatsPeople(true);
  const openProfile = useOpenProfile();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const term = q.trim().toLowerCase();
  const rows = data.people.filter((p) =>
    (!riskOnly || p.atRisk) &&
    (!dept || p.dept === dept) &&
    (!term || p.name.toLowerCase().includes(term) || (p.jobTitle ?? "").toLowerCase().includes(term) || (p.dept ?? "").toLowerCase().includes(term)));
  const atRisk = data.people.filter((p) => p.atRisk).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="">All departments</option>
          {data.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${riskOnly ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-muted"}`}>
          <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} /> Members to check in on{atRisk > 0 ? ` (${atRisk})` : ""}
        </label>
        <span className="text-sm text-muted">{rows.length} {rows.length === 1 ? "person" : "people"}</span>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted"><tr className="border-b border-border">
            <th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Dept</th><th className="px-3 py-2 font-medium">Last check-in</th><th className="px-3 py-2 font-medium">Check-ins 30d</th><th className="px-3 py-2 font-medium">Last login</th><th className="px-3 py-2 font-medium">Points</th><th className="px-3 py-2 font-medium">Recognition</th>
          </tr></thead>
          <tbody>
            {rows.map((p: PersonStat) => (
              <tr key={p.id} className={`cursor-pointer border-b border-border last:border-0 hover:bg-border/30 ${p.atRisk ? "bg-amber-50/40" : ""}`} onClick={() => openProfile(p.id)}>
                <td className="px-3 py-2"><span className="font-medium">{p.name}</span>{p.atRisk && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">check in</span>}{p.jobTitle && <div className="text-xs text-muted">{p.jobTitle}</div>}</td>
                <td className="px-3 py-2 text-muted">{p.dept ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{ago(p.lastCheckin)}</td>
                <td className="px-3 py-2 text-muted">{p.checkins30}</td>
                <td className="px-3 py-2 text-muted">{ago(p.lastLogin)}</td>
                <td className="px-3 py-2 text-muted">{p.points.toLocaleString()}</td>
                <td className="px-3 py-2 text-muted">{p.recognition}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-sm text-muted">No one matches.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TeamsTab() {
  const { data } = useTeams(true);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const t: Teams = data;
  if (t.departments.length === 0) return <Card><p className="text-sm text-muted">No departments to compare yet — set up your org structure in Settings → Organization.</p></Card>;
  const maxRec = Math.max(1, ...t.departments.map((d) => d.recognition));
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-muted">Department comparison</h3>
      <p className="mb-3 text-xs text-muted/70">Top-level teams, ranked by recent check-in engagement. Wellbeing shown only for teams with 5+ check-ins.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">Department</th><th className="pb-1">People</th><th className="pb-1">Check-in engagement</th><th className="pb-1">Recognition</th><th className="pb-1">Avg stress</th></tr></thead>
        <tbody>
          {t.departments.map((d, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-2 font-medium">{d.name}</td>
              <td className="py-2 text-muted">{d.headcount}</td>
              <td className="py-2"><span className="inline-flex items-center gap-2"><span className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-border"><span className="block h-full bg-primary" style={{ width: `${d.checkinRatePct}%` }} /></span>{d.checkinRatePct}%</span></td>
              <td className="py-2"><span className="inline-flex items-center gap-2"><span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-border"><span className="block h-full bg-amber-400" style={{ width: `${(d.recognition / maxRec) * 100}%` }} /></span>{d.recognition}</span></td>
              <td className="py-2">{d.avgWellness != null ? `${d.avgWellness}/5` : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function EngagementTab() {
  const { data } = useEngagement(true);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const s: Engagement = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Logins (30d)" value={s.logins.success30} sub={`${s.logins.distinctUsers30} distinct people`} />
        <Kpi label="Failed logins (30d)" value={s.logins.failed30} sub="wrong password on a real account" />
        <Kpi label="Areas in use" value={s.byArea.filter((a) => a.surface !== "login").length} />
      </div>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-muted">Reach by area (30 days)</h3>
        <ReachTable rows={s.byArea.filter((a) => a.surface !== "login").map((a) => ({ name: a.surface, views: a.views, reach: a.reach, reachPct: a.reachPct }))} />
      </Card>
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted">Most-viewed items</h3>
        <p className="mb-3 text-xs text-muted/70">Specific boards, surveys, quizzes and sessions people opened</p>
        <ReachTable rows={s.topItems.map((i) => ({ name: `${i.title}`, area: i.surface, views: i.views, reach: i.reach, reachPct: i.reachPct }))} showArea />
      </Card>
      <Series title="Logins / day" sub="✅ success vs ⚠️ failed (last 14 days)" color="bg-sky-400" data={s.logins.perDay.map((d) => ({ label: dl(d.day), value: d.success }))} />
    </div>
  );
}
function ReachTable({ rows, showArea }: { rows: { name: string; area?: string; views: number; reach: number; reachPct: number }[]; showArea?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No view data yet — it builds as people use the app.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">{showArea ? "Item" : "Area"}</th>{showArea && <th className="pb-1 font-medium">Area</th>}<th className="pb-1 font-medium">Views</th><th className="pb-1 font-medium">Reached</th><th className="pb-1 font-medium">Reach</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            <td className="py-1.5 capitalize">{r.name}</td>
            {showArea && <td className="py-1.5 text-muted capitalize">{r.area}</td>}
            <td className="py-1.5 text-muted">{r.views}</td>
            <td className="py-1.5 text-muted">{r.reach}</td>
            <td className="py-1.5"><span className="inline-flex items-center gap-2"><span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-border"><span className="block h-full bg-primary" style={{ width: `${r.reachPct}%` }} /></span>{r.reachPct}%</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProgramsTab() {
  const { data } = usePrograms(true);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const s: Programs = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Recognition (all time)" value={s.recognition.total} sub={`${s.recognition.last30} in 30 days`} />
        <Kpi label="Recognised (90d)" value={`${s.recognition.coveragePct}%`} sub="share of members" />
        <Kpi label="Gave recognition (90d)" value={`${s.recognition.giverPct}%`} sub="share of members" />
        <Kpi label="Stars given" value={s.recognition.likes} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Series title="Recognition / week" sub="last 12 weeks" color="bg-emerald-400" data={s.recognition.perWeek.map((w) => ({ label: w.week.slice(5), value: w.count }))} />
        <Card><h3 className="mb-3 text-sm font-semibold text-muted">Recognition by badge</h3><BarList rows={s.recognition.byBadge.map((b) => ({ label: `${badgeOf(b.badge).emoji} ${badgeOf(b.badge).label}`, value: b.n }))} /></Card>
        <Card><h3 className="mb-3 text-sm font-semibold text-muted">Most recognised people</h3><BarList rows={s.recognition.topRecipients.map((t) => ({ label: t.name, value: t.n }))} /></Card>
        <Card className="flex flex-col"><h3 className="text-sm font-semibold text-muted">Wellness check-ins (30d)</h3><div className="my-auto text-3xl font-semibold text-fg">{s.wellness.count30}</div><div className="text-xs text-muted">Avg stress {s.wellness.avgStress != null ? `${s.wellness.avgStress}/5` : "— (needs 5+)"}</div></Card>
      </div>
      {s.wellness.checkinsPerWeek.some((w) => w.count > 0) && (
        <Series title="Wellness check-ins / week" sub="participation, last 12 weeks" color="bg-indigo-400" data={s.wellness.checkinsPerWeek.map((w) => ({ label: w.week.slice(5), value: w.count }))} />
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {s.wellness.distribution.length > 0 && (
          <Card><h3 className="mb-1 text-sm font-semibold text-muted">Wellbeing distribution (30d)</h3><p className="mb-3 text-xs text-muted/70">How people rated their stress — aggregate only</p>
            <BarList rows={s.wellness.distribution.map((d) => ({ label: ["", "1 · Great", "2", "3 · OK", "4", "5 · Struggling"][d.stress], value: d.n }))} /></Card>
        )}
        <Card><h3 className="mb-1 text-sm font-semibold text-muted">Stress trend (6 weeks)</h3><p className="mb-3 text-xs text-muted/70">Average stress per week — weeks with under 5 check-ins stay hidden</p>
          <VBars data={s.wellness.trend.map((w) => ({ label: `wk ${w.week.slice(5)}`, value: w.avgStress ?? 0 }))} unit="/5" color="bg-indigo-400" />
          {s.wellness.trend.every((w) => w.locked) && <p className="mt-1 text-xs text-muted">Not enough check-ins yet to show a trend.</p>}
        </Card>
      </div>
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted">Surveys</h3>
        <p className="mb-3 text-xs text-muted/70">Views → started → completed, and average progress</p>
        {s.surveys.length === 0 ? <p className="text-sm text-muted">No surveys yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">Survey</th><th className="pb-1">Status</th><th className="pb-1">Views</th><th className="pb-1">Started</th><th className="pb-1">Completed</th><th className="pb-1">Completion</th><th className="pb-1">Avg progress</th></tr></thead>
            <tbody>{s.surveys.map((sv, i) => (
              <tr key={i} className="border-t border-border"><td className="py-1.5">{sv.title}</td><td className="py-1.5 text-muted">{sv.status.toLowerCase()}</td><td className="py-1.5 text-muted">{sv.views}</td><td className="py-1.5 text-muted">{sv.started}</td><td className="py-1.5 text-muted">{sv.completed}</td><td className="py-1.5">{sv.completionPct}%</td><td className="py-1.5">{sv.avgProgressPct}%</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ContentTab() {
  const { data } = useContent(true);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const s: Content = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Board posts" value={s.boards.posts} sub={`${s.boards.comments} comments`} />
        <Kpi label="Tasks completed" value={s.tasks.completed} sub={`${s.tasks.created} created`} />
        <Kpi label="Shop redemptions" value={s.shop.redeemed} sub={`${s.shop.participationPct}% of members have bought`} />
        <Kpi label="Requests" value={s.requests.total} sub={`${s.requests.pending} pending`} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Events" value={s.events.total} sub={`${s.events.fundraisers} fundraisers · ${s.events.photos} photos`} />
        <Kpi label="Raised" value={s.events.contributed.toLocaleString()} sub="contribution fund" />
        <Kpi label="Tournaments" value={s.tournaments.total} sub={`${s.tournaments.champions.length} finished`} />
        <Kpi label="Achievements earned" value={s.achievements.awarded} />
      </div>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted">Quizzes</h3>
        <p className="mb-3 text-xs text-muted/70">Players, average score and the winner</p>
        {s.quizzes.length === 0 ? <p className="text-sm text-muted">No quizzes played yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">Quiz</th><th className="pb-1">Players</th><th className="pb-1">Avg score</th><th className="pb-1">🏆 Winner</th></tr></thead>
            <tbody>{s.quizzes.map((q, i) => (
              <tr key={i} className="border-t border-border"><td className="py-1.5">{q.title}</td><td className="py-1.5 text-muted">{q.players}</td><td className="py-1.5">{q.avgScorePct}%</td><td className="py-1.5">{q.winner ? `${q.winner.name} (${q.winner.points})` : "—"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-muted">Announcement reach</h3>
        <p className="mb-3 text-xs text-muted/70">Who received each announcement, how many opened it, and (if required) acknowledged</p>
        {s.announcements.length === 0 ? <p className="text-sm text-muted">No announcements yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">Announcement</th><th className="pb-1">Recipients</th><th className="pb-1">Opened</th><th className="pb-1">Acknowledged</th></tr></thead>
            <tbody>{s.announcements.map((a, i) => (
              <tr key={i} className="border-t border-border"><td className="py-1.5">{a.title}{a.requireAck ? " ✋" : ""}</td><td className="py-1.5 text-muted">{a.recipients}</td><td className="py-1.5">{a.seen} <span className="text-muted">({a.seenPct}%)</span></td><td className="py-1.5">{a.requireAck ? `${a.acked} (${a.ackPct}%)` : "—"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-muted">🏆 Tournament champions</h3>
          <p className="mb-3 text-xs text-muted/70">Winners of finished tournaments</p>
          {s.tournaments.champions.length === 0 ? <p className="text-sm text-muted">No finished tournaments.</p> : (
            <ul className="space-y-1 text-sm">{s.tournaments.champions.map((c, i) => (
              <li key={i} className="flex items-center gap-2"><span className="font-medium">{c.winner ?? "—"}</span><span className="text-muted">{c.title}{c.game ? ` · ${c.game}` : ""}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card><h3 className="mb-3 text-sm font-semibold text-muted">Most-earned achievements</h3><BarList rows={s.achievements.top.map((a) => ({ label: `${a.icon ?? "🏅"} ${a.name}`, value: a.n }))} /></Card>
        <Card><h3 className="mb-3 text-sm font-semibold text-muted">In-session activities run</h3><BarList rows={s.activities.map((a) => ({ label: a.type.toLowerCase().replace(/_/g, " "), value: a.n }))} /></Card>
        <Series title="Tasks created / day" sub="last 14 days" color="bg-amber-400" data={s.tasks.perDay.map((d) => ({ label: dl(d.day), value: d.created }))} />
        <Series title="Tasks completed / day" sub="last 14 days" color="bg-emerald-400" data={s.tasks.perDay.map((d) => ({ label: dl(d.day), value: d.completed }))} />
        <Series title="Requests / day" sub="last 14 days" color="bg-sky-400" data={s.requests.perDay.map((d) => ({ label: dl(d.day), value: d.count }))} />
        <Series title="Feedback / day" sub="suggestions + complaints" color="bg-rose-400" data={s.feedback.perDay.map((d) => ({ label: dl(d.day), value: d.count }))} />
        {s.feedback.complaintsPerWeek.length > 0 && (
          <Series title="Complaints / week" sub="last 12 weeks · anonymous" color="bg-rose-500" data={s.feedback.complaintsPerWeek.map((w) => ({ label: w.week.slice(5), value: w.count }))} />
        )}
        {(s.feedback.suggestions + s.feedback.complaints) > 0 && (
          <Card>
            <h3 className="mb-1 text-sm font-semibold text-muted">Feedback responsiveness</h3>
            <p className="mb-2 text-xs text-muted/70">How much you act on what's raised</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><b className="text-fg">{s.feedback.adoptionPct}%</b> <span className="text-muted">adopted (planned/done of decided)</span></span>
              <span><b className="text-fg">{s.feedback.avgResolutionDays != null ? `${s.feedback.avgResolutionDays}d` : "—"}</b> <span className="text-muted">avg to resolve</span></span>
            </div>
            {s.feedback.byCategory.length > 0 && <div className="mt-3"><div className="mb-1 text-xs font-medium text-muted">Complaints by category</div><BarList rows={s.feedback.byCategory.map((c) => ({ label: CAT_LABEL[c.category] ?? c.category, value: c.n }))} /></div>}
          </Card>
        )}
        <Card><h3 className="mb-3 text-sm font-semibold text-muted">Most-redeemed shop items</h3><BarList rows={s.shop.byItem.map((it) => ({ label: it.name, value: it.count }))} /></Card>
        <Card><h3 className="mb-3 text-sm font-semibold text-muted">Most-discussed board posts</h3><BarList rows={s.boards.topPosts.map((p) => ({ label: p.title, value: p.comments }))} /></Card>
      </div>
    </div>
  );
}
