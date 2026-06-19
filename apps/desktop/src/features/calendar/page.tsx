import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type CalReward, useCalendar, useCheckin, useClearReward, useSetReward } from "../../lib/points";
import { type EventListItem, useEvents, useImportIcs } from "../../lib/events";
import { useTenantSettings } from "../../lib/tenant";
import { KIND_META, fmtWhen } from "../events/page";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const KIND_STYLE: Record<string, string> = { POINTS: "bg-primary/15 text-primary", PRIZE: "bg-amber-100 text-amber-700", TITLE: "bg-violet-100 text-violet-700", PROFILE: "bg-emerald-100 text-emerald-700" };
const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
type View = "month" | "week" | "day" | "grid";
type ScopeFilter = "all" | "ALL" | "NODE" | "GROUP";
const SCOPE_LABELS: [ScopeFilter, string][] = [["all", "Everything"], ["ALL", "Org-wide"], ["NODE", "Department"], ["GROUP", "Team"]];

async function exportIcs() {
  const res = await fetch("/api/events/calendar.ics", { credentials: "include" });
  const blob = new Blob([await res.text()], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "ces-events.ics"; a.click(); URL.revokeObjectURL(url);
}

export function TeamCalendarPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("month");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [anchor, setAnchor] = useState(() => new Date()); // any date inside the shown period
  const month = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
  const { data } = useCalendar(month);
  const { data: eventsData } = useEvents();
  const { data: settings } = useTenantSettings();
  const checkin = useCheckin();
  const importIcs = useImportIcs();
  const [editing, setEditing] = useState<string | null>(null);

  const onImport = async (file: File) => {
    const res = await importIcs.mutateAsync(await file.text());
    alert(`Imported ${res.imported} event${res.imported === 1 ? "" : "s"} into your department calendar.${res.skipped ? ` ${res.skipped} skipped (over the 200 limit).` : ""}`);
  };

  if (!data) return <div className="p-2 text-sm text-muted">Loading…</div>;
  const checkins = new Set(data.checkins);
  const rewardOf = (d: string) => data.rewards.find((r) => r.day === d);
  const events = (eventsData?.events ?? []).filter((e) => e.startAt && (scope === "all" || e.scopeKind === scope));
  const eventsOn = (d: string) => events.filter((e) => e.startAt!.slice(0, 10) === d).sort((a, b) => a.startAt!.localeCompare(b.startAt!));

  const shift = (by: number) => { const d = new Date(anchor); if (view === "month") d.setMonth(d.getMonth() + by); else if (view === "week" || view === "grid") d.setDate(d.getDate() + by * 7); else d.setDate(d.getDate() + by); setAnchor(new Date(d)); };

  return (
    <div className="max-w-5xl">
      <PageHeader title="Team calendar" subtitle="Activities across the org, your department, or a team — plus the daily check-in rewards." />

      <Card className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><span className="text-xl">🔥</span><div><div className="font-semibold text-fg">{data.streak}-day streak</div><div className="text-xs text-muted">{data.balance} pts</div></div></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={scope} onChange={(e) => setScope(e.target.value as ScopeFilter)} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">
            {SCOPE_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {(["month", "week", "day", "grid"] as View[]).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-md px-2 py-1 capitalize ${view === v ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>{v}</button>)}
          </div>
          <button onClick={exportIcs} className="text-xs text-primary hover:underline">⤓ .ics</button>
          <label className="cursor-pointer text-xs text-primary hover:underline">
            ⤒ .ics
            <input type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
          </label>
          {data.checkedInToday ? <span className="text-xs text-emerald-600">✓ in</span> : <Button onClick={() => checkin.mutate()} disabled={checkin.isPending}>Check in</Button>}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => shift(-1)} className="text-sm text-muted hover:text-fg">←</button>
          <h2 className="text-sm font-semibold text-fg">{periodLabel(view, anchor)}</h2>
          <button onClick={() => shift(1)} className="text-sm text-muted hover:text-fg">→</button>
        </div>
        {view === "month" && <MonthGrid anchor={anchor} today={data.today} checkins={checkins} rewardOf={rewardOf} eventsOn={eventsOn} canManage={data.canManage} onEdit={setEditing} onEvent={(id) => navigate(`/events/${id}`)} />}
        {view === "week" && <WeekView anchor={anchor} today={data.today} checkins={checkins} rewardOf={rewardOf} eventsOn={eventsOn} tz={settings?.timezone} onEvent={(id) => navigate(`/events/${id}`)} />}
        {view === "day" && <DayView day={ymd(anchor)} today={data.today} checkedIn={checkins.has(ymd(anchor))} reward={rewardOf(ymd(anchor))} events={eventsOn(ymd(anchor))} tz={settings?.timezone} canManage={data.canManage} onEdit={() => setEditing(ymd(anchor))} onEvent={(id) => navigate(`/events/${id}`)} />}
        {view === "grid" && <TimetableView anchor={anchor} today={data.today} checkins={checkins} rewardOf={rewardOf} eventsOn={eventsOn} tz={settings?.timezone} onEvent={(id) => navigate(`/events/${id}`)} />}
      </Card>

      {editing && data.canManage && <RewardEditor month={month} day={editing} existing={rewardOf(editing)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function periodLabel(view: View, d: Date) {
  if (view === "month") return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (view === "day") return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const s = new Date(d); s.setDate(d.getDate() - d.getDay());
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

type CellProps = { today: string; checkins: Set<string>; rewardOf: (d: string) => CalReward | undefined; eventsOn: (d: string) => EventListItem[]; onEvent: (id: string) => void };

function MonthGrid({ anchor, canManage, onEdit, ...p }: CellProps & { anchor: Date; canManage: boolean; onEdit: (d: string) => void }) {
  const y = anchor.getFullYear(), mo = anchor.getMonth();
  const firstWeekday = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const ds = ymd(new Date(y, mo, i + 1));
          const r = p.rewardOf(ds); const evs = p.eventsOn(ds); const done = p.checkins.has(ds);
          return (
            <div key={ds} className={`flex min-h-20 flex-col gap-0.5 rounded-lg border p-1 ${ds === p.today ? "border-primary" : "border-border"}`}>
              <div className="flex items-center justify-between"><span className={`text-xs ${done ? "font-bold text-emerald-600" : "text-muted"}`}>{i + 1}{done ? " ✓" : ""}</span>{canManage && <button onClick={() => onEdit(ds)} className="text-[10px] text-muted/60 hover:text-primary" title="Set reward">✎</button>}</div>
              {r && <button onClick={() => canManage && onEdit(ds)} className={`truncate rounded px-1 py-0.5 text-left text-[10px] ${KIND_STYLE[r.kind]}`} title={r.label}>🎁 {r.kind === "POINTS" ? `+${r.points}` : r.label}</button>}
              {evs.map((e) => <button key={e.id} onClick={() => p.onEvent(e.id)} className="truncate rounded bg-border/50 px-1 py-0.5 text-left text-[10px] text-fg hover:bg-border" title={e.title}>{KIND_META[e.kind].icon} {e.title}</button>)}
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekView({ anchor, tz, ...p }: CellProps & { anchor: Date; tz?: string }) {
  const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
  return (
    <div className="space-y-1">
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start); d.setDate(start.getDate() + i); const ds = ymd(d);
        const r = p.rewardOf(ds); const evs = p.eventsOn(ds); const done = p.checkins.has(ds);
        return (
          <div key={ds} className={`flex gap-2 rounded-lg border p-2 ${ds === p.today ? "border-primary" : "border-border"}`}>
            <div className="w-24 shrink-0 text-sm"><div className={`font-medium ${done ? "text-emerald-600" : "text-fg"}`}>{d.toLocaleDateString(undefined, { weekday: "short" })} {d.getDate()}{done ? " ✓" : ""}</div></div>
            <div className="flex flex-1 flex-wrap gap-1">
              {r && <span className={`rounded px-1.5 py-0.5 text-xs ${KIND_STYLE[r.kind]}`}>🎁 {r.kind === "POINTS" ? `+${r.points}` : r.label}</span>}
              {evs.map((e) => <button key={e.id} onClick={() => p.onEvent(e.id)} className="rounded bg-border/50 px-2 py-0.5 text-xs text-fg hover:bg-border">{KIND_META[e.kind].icon} {e.title} <span className="text-muted">{e.startAt ? fmtWhen(e.startAt, tz).split(", ").pop() : ""}</span></button>)}
              {!r && evs.length === 0 && <span className="text-xs text-muted/50">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ day, reward, events, tz, canManage, onEdit, onEvent, checkedIn }: { day: string; today: string; checkedIn: boolean; reward?: CalReward; events: EventListItem[]; tz?: string; canManage: boolean; onEdit: () => void; onEvent: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {checkedIn ? <span className="text-emerald-600">✓ You checked in</span> : <span className="text-muted">Not checked in</span>}
        {reward ? <span className={`rounded-full px-2 py-0.5 text-xs ${KIND_STYLE[reward.kind]}`}>🎁 {reward.kind === "POINTS" ? `+${reward.points} points` : reward.label}</span> : canManage ? <button onClick={onEdit} className="text-xs text-primary hover:underline">+ Set reward</button> : null}
        {reward && canManage && <button onClick={onEdit} className="text-xs text-primary hover:underline">edit reward</button>}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">Events</h3>
        {events.length === 0 ? <p className="text-sm text-muted">Nothing scheduled for {day}.</p> : (
          <ul className="space-y-1">{events.map((e) => (
            <li key={e.id}><button onClick={() => onEvent(e.id)} className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm hover:bg-border/30">
              <span className="text-lg">{KIND_META[e.kind].icon}</span><span className="flex-1 text-fg">{e.title}</span>
              <span className="text-xs text-muted">{e.scope} · {e.startAt ? fmtWhen(e.startAt, tz).split(", ").pop() : ""}</span>
            </button></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

// Horizontal timetable: hours across the top, days down the left, events as positioned block-outs.
// Each day's events stack on their own line so overlaps never collide. Uses the browser's local hours.
function TimetableView({ anchor, tz, ...p }: CellProps & { anchor: Date; tz?: string }) {
  const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const hourOf = (iso: string) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; };
  let h0 = 8, h1 = 18; // business hours by default, widened to fit any event in view
  for (const d of days) for (const e of p.eventsOn(ymd(d))) {
    const s = hourOf(e.startAt!), en = e.endAt ? hourOf(e.endAt) : s + 1;
    h0 = Math.min(h0, Math.floor(s)); h1 = Math.max(h1, Math.ceil(en));
  }
  h0 = Math.max(0, h0); h1 = Math.min(24, Math.max(h1, h0 + 1));
  const span = h1 - h0;
  const hours = Array.from({ length: span }, (_, i) => h0 + i);
  const pct = (h: number) => ((h - h0) / span) * 100;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="flex">
          <div className="w-24 shrink-0" />
          <div className="flex flex-1">{hours.map((h) => <div key={h} className="flex-1 border-l border-border/50 pl-1 text-[10px] text-muted">{String(h).padStart(2, "0")}</div>)}</div>
        </div>
        {days.map((d) => {
          const ds = ymd(d); const evs = p.eventsOn(ds); const done = p.checkins.has(ds);
          return (
            <div key={ds} className={`flex border-t ${ds === p.today ? "border-primary" : "border-border"}`}>
              <div className="flex w-24 shrink-0 items-center py-1 text-sm"><span className={done ? "font-medium text-emerald-600" : "text-fg"}>{d.toLocaleDateString(undefined, { weekday: "short" })} {d.getDate()}{done ? " ✓" : ""}</span></div>
              <div className="relative flex-1" style={{ minHeight: `${Math.max(1, evs.length) * 1.6 + 0.2}rem` }}>
                <div className="absolute inset-0 flex">{hours.map((h) => <div key={h} className="flex-1 border-l border-border/30" />)}</div>
                {evs.map((e, i) => {
                  const s = hourOf(e.startAt!), en = e.endAt ? Math.max(hourOf(e.endAt), s + 0.5) : s + 1;
                  return (
                    <button key={e.id} onClick={() => p.onEvent(e.id)} title={`${e.title} · ${fmtWhen(e.startAt!, tz).split(", ").pop()}`}
                      className="absolute truncate rounded bg-primary/15 px-1 text-left text-[10px] text-primary hover:bg-primary/25"
                      style={{ left: `${pct(s)}%`, width: `${Math.max(2, pct(en) - pct(s))}%`, top: `${i * 1.6 + 0.15}rem`, height: "1.4rem", lineHeight: "1.4rem" }}>
                      {KIND_META[e.kind].icon} {e.title}
                    </button>
                  );
                })}
                {evs.length === 0 && <span className="absolute left-1 top-1 text-[10px] text-muted/40">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RewardEditor({ month, day, existing, onClose }: { month: string; day: string; existing?: CalReward; onClose: () => void }) {
  const save = useSetReward(month);
  const clear = useClearReward(month);
  const [kind, setKind] = useState(existing?.kind ?? "POINTS");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [points, setPoints] = useState(String(existing?.points ?? 50));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-fg">Check-in reward for {day}</h3>
        <select value={kind} onChange={(e) => setKind(e.target.value as CalReward["kind"])} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="POINTS">Points (auto-credited)</option><option value="PRIZE">Real-world prize</option><option value="TITLE">Title / achievement</option><option value="PROFILE">Profile enhancement</option>
        </select>
        <Input placeholder={kind === "POINTS" ? "Label (e.g. Double points day)" : "Prize (e.g. Coffee voucher)"} value={label} onChange={(e) => setLabel(e.target.value)} />
        {kind === "POINTS" && <Input type="number" placeholder="Points" value={points} onChange={(e) => setPoints(e.target.value)} />}
        <div className="flex gap-2">
          <Button disabled={!label.trim() || save.isPending} onClick={() => save.mutate({ day, kind, label: label.trim(), points: Number(points) || 0 }, { onSuccess: onClose })}>Save</Button>
          {existing && <button onClick={() => clear.mutate(day, { onSuccess: onClose })} className="text-sm text-red-600 hover:underline">Clear</button>}
          <button onClick={onClose} className="ml-auto text-sm text-muted hover:underline">Cancel</button>
        </div>
      </Card>
    </div>
  );
}
