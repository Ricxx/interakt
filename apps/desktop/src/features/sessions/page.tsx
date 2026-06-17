import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../../lib/auth";
import { useEndSession, useGoLive, useHistory, useHosting, useMeInvites, useRecentSessions, useStartSession } from "../../lib/sessions";
import { useLocalSessionNames } from "../../lib/session-names";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

export function SessionsPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const start = useStartSession();
  const end = useEndSession();
  const goLive = useGoLive();
  const { data: invites } = useMeInvites();
  const { data: hosting } = useHosting();
  const { data: recent } = useRecentSessions();
  const { data: history } = useHistory();
  const localNames = useLocalSessionNames(me?.email ?? "anon");
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState("");

  function host(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    localNames.add(title.trim());
    const scheduledAt = schedule && when ? new Date(when).toISOString() : undefined;
    start.mutate(
      { title: title.trim(), scheduledAt },
      {
        onSuccess: (r) => {
          setTitle("");
          setSchedule(false);
          setWhen("");
          // Always open the session so the host can add participants + configure
          // (a scheduled session with no invitees would be invisible to everyone).
          navigate(`/sessions/${r.session.id}`);
        },
      },
    );
  }

  function rehost(r: { title: string; scopeKind: string | null; scopeId: string | null }) {
    localNames.add(r.title);
    start.mutate(
      { title: r.title, scopeKind: r.scopeKind ?? undefined, scopeId: r.scopeId },
      { onSuccess: (res) => navigate(`/sessions/${res.session.id}`) },
    );
  }

  const live = (hosting?.sessions ?? []).filter((s) => s.state === "LIVE");
  const upcoming = (hosting?.sessions ?? []).filter((s) => s.state === "SCHEDULED");
  const myInvites = invites?.invites ?? [];

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between">
        <PageHeader title="Sessions" subtitle="Host a live room now, or schedule one — then configure it and invite people." />
        <button onClick={() => navigate("/randomizer")} className="mt-1 shrink-0 text-sm text-primary hover:underline">
          Random name picker
        </button>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">New session</h2>
        <form onSubmit={host} className="space-y-3">
          <Input list="ces-session-names" placeholder="Session title (e.g. Monday Standup)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <datalist id="ces-session-names">{localNames.names.map((n) => <option key={n} value={n} />)}</datalist>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
            Schedule for later
          </label>
          {schedule && <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
          <Button type="submit" disabled={start.isPending || (schedule && !when)}>
            {start.isPending ? "…" : schedule ? "Schedule" : "Start now"}
          </Button>
        </form>
        {localNames.names.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {localNames.names.map((n) => (
              <span key={n} className="flex items-center gap-1 rounded-full bg-border/50 px-2.5 py-1 text-xs">
                <button type="button" onClick={() => setTitle(n)} className="hover:underline">{n}</button>
                <button type="button" onClick={() => localNames.remove(n)} className="text-muted hover:text-fg" title="Forget">×</button>
              </span>
            ))}
          </div>
        )}
        {recent && recent.recent.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold text-muted">Rehost (re-invites the same audience)</div>
            <div className="flex flex-wrap gap-2">
              {recent.recent.map((r, i) => (
                <button key={i} onClick={() => rehost(r)} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-border/50">
                  {r.title} <span className="text-xs text-muted">· {r.audience}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {live.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">Live now</h2>
          <ul className="space-y-1">
            {live.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.title} <span className="text-xs text-muted">· LIVE</span>{s.joinCode && <span className="ml-1 rounded bg-border/60 px-1.5 py-0.5 font-mono text-xs">{s.joinCode}</span>}</span>
                <span className="flex gap-3">
                  <button onClick={() => navigate(`/sessions/${s.id}`)} className="text-xs text-primary hover:underline">Open</button>
                  <button onClick={() => end.mutate(s.id)} className="text-xs text-red-600 hover:underline">End</button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">Upcoming (scheduled)</h2>
          <ul className="space-y-1">
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.title} <span className="text-xs text-muted">· {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "scheduled"}</span>{s.joinCode && <span className="ml-1 rounded bg-border/60 px-1.5 py-0.5 font-mono text-xs">{s.joinCode}</span>}</span>
                <span className="flex gap-3">
                  <button onClick={() => goLive.mutate(s.id, { onSuccess: () => navigate(`/sessions/${s.id}`) })} className="text-xs text-primary hover:underline">Start now</button>
                  <button onClick={() => navigate(`/sessions/${s.id}`)} className="text-xs text-primary hover:underline">Open</button>
                  <button onClick={() => end.mutate(s.id)} className="text-xs text-red-600 hover:underline">Cancel</button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {myInvites.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">Your invitations</h2>
          <ul className="space-y-1">
            {myInvites.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-sm">
                <span>{i.title} <span className="text-xs text-muted">· {i.state === "SCHEDULED" ? (i.scheduledAt ? fmt(i.scheduledAt) : "scheduled") : "live now"}</span>{i.joinCode && <span className="ml-1 rounded bg-border/60 px-1.5 py-0.5 font-mono text-xs">{i.joinCode}</span>}</span>
                <button onClick={() => navigate(`/sessions/${i.id}`)} className="text-xs text-primary hover:underline">Open</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {history && history.history.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-muted">Past sessions</h2>
          <ul className="space-y-1">
            {history.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <span>
                  {h.title}
                  <span className="text-xs text-muted"> · {h.iHosted ? "you hosted" : `by ${h.hostName}`}{h.endedAt ? ` · ${fmt(h.endedAt)}` : ""}</span>
                  {h.joinCode && <span className="ml-1 rounded bg-border/60 px-1.5 py-0.5 font-mono text-xs">{h.joinCode}</span>}
                </span>
                <button onClick={() => navigate(`/sessions/${h.id}`)} className="text-xs text-primary hover:underline">View log</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
