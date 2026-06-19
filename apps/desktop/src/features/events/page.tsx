import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type CreateEvent, type EventKind, useCreateEvent, useEvents } from "../../lib/events";
import { useOrgNodes, useGroupsList } from "../../lib/recognition";
import { useTenantSettings } from "../../lib/tenant";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export const KIND_META: Record<EventKind, { icon: string; label: string }> = {
  PLAN: { icon: "📅", label: "Plan" },
  FUND: { icon: "💰", label: "Fund" },
  THEME_DAY: { icon: "🎉", label: "Theme day" },
};

export function fmtWhen(iso: string | null, tz: string | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(undefined, { timeZone: tz, dateStyle: "medium", timeStyle: "short" }); } catch { return new Date(iso).toLocaleString(); }
}

export function EventsPage() {
  const { data } = useEvents();
  const navigate = useNavigate();
  const { data: settings } = useTenantSettings();
  const events = data?.events ?? [];
  return (
    <div className="max-w-3xl">
      <PageHeader title="Events" subtitle="Plan outings & funds, or run a theme day with a photo gallery." />
      <CreateEventForm />
      {events.length === 0 ? (
        <Card><p className="text-sm text-muted">No events yet — create one above.</p></Card>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <Card key={e.id} className="flex cursor-pointer items-center gap-3 py-3 hover:bg-border/30" onClick={() => navigate(`/events/${e.id}`)}>
              <span className="text-2xl">{KIND_META[e.kind].icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{e.title}</div>
                <div className="text-xs text-muted">{KIND_META[e.kind].label} · {e.scope}{e.startAt ? ` · ${fmtWhen(e.startAt, settings?.timezone)}` : ""}</div>
              </div>
              {e.kind === "FUND" && e.goalAmount != null && <span className="text-xs text-muted">goal {e.goalAmount}</span>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateEventForm() {
  const create = useCreateEvent();
  const navigate = useNavigate();
  const nodes = useOrgNodes();
  const groups = useGroupsList();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventKind>("THEME_DAY");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [scopeKind, setScopeKind] = useState<"ALL" | "NODE" | "GROUP">("NODE");
  const [scopeId, setScopeId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [goal, setGoal] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!title.trim() || (scopeKind !== "ALL" && !scopeId)) return;
    setErr("");
    const v: CreateEvent = { kind, title: title.trim(), instructions: instructions.trim() || undefined, scopeKind, scopeId: scopeKind === "ALL" ? null : scopeId, startAt: startAt ? new Date(startAt).toISOString() : null, goalAmount: kind === "FUND" && goal ? Number(goal) : null };
    create.mutate(v, {
      onSuccess: (r) => { setOpen(false); setTitle(""); setInstructions(""); setStartAt(""); setGoal(""); navigate(`/events/${r.id}`); },
      onError: (e: unknown) => setErr((e as { message?: string })?.message === "forbidden" ? "You can't create org-wide events — pick a department or team." : "Couldn't create — try again."),
    });
  }

  if (!open) return <Card className="mb-4"><button onClick={() => setOpen(true)} className="text-sm font-medium text-primary">+ New event</button></Card>;

  return (
    <Card className="mb-4 space-y-2">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-muted">New event</h2><button onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">cancel</button></div>
      <div className="flex gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="THEME_DAY">🎉 Theme day</option>
          <option value="PLAN">📅 Plan / outing</option>
          <option value="FUND">💰 Fund</option>
        </select>
        <Input className="flex-1" placeholder="Title (e.g. Red Tie Day)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions / details (what to wear, where to meet, etc.)" rows={3} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <select value={scopeKind} onChange={(e) => { setScopeKind(e.target.value as "ALL" | "NODE" | "GROUP"); setScopeId(""); }} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="NODE">Department</option>
          <option value="GROUP">Team</option>
          <option value="ALL">Org-wide</option>
        </select>
        {scopeKind === "NODE" && (
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Which department?</option>
            {(nodes.data?.nodes ?? []).filter((n) => n.nodeType !== "ORG").map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        {scopeKind === "GROUP" && (
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Which team?</option>
            {(groups.data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        {kind === "FUND" && <Input className="w-32" type="number" placeholder="Goal" value={goal} onChange={(e) => setGoal(e.target.value)} />}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button disabled={!title.trim() || (scopeKind !== "ALL" && !scopeId) || create.isPending} onClick={submit}>Create</Button>
    </Card>
  );
}
