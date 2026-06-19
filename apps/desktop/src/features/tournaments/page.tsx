import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type CreateTournament, useCreateTournament, useTournaments } from "../../lib/tournaments";
import { useTaskPeople } from "../../lib/tasks";
import { useOrgNodes, useGroupsList } from "../../lib/recognition";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

type Mode = "PICK" | "QUICK" | "SIGNUP";

export function TournamentsPage() {
  const { data } = useTournaments();
  const navigate = useNavigate();
  const tournaments = data?.tournaments ?? [];
  return (
    <div className="max-w-3xl">
      <PageHeader title="Tournaments" subtitle="Run a knockout bracket — pick players, auto-fill a team, or open sign-ups." />
      <CreateForm />
      {tournaments.length === 0 ? (
        <Card><p className="text-sm text-muted">No tournaments yet — create one above.</p></Card>
      ) : (
        <div className="space-y-2">
          {tournaments.map((t) => (
            <Card key={t.id} className="flex cursor-pointer items-center gap-3 py-3 hover:bg-border/30" onClick={() => navigate(`/tournaments/${t.id}`)}>
              <span className="text-2xl">🏆</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-fg">{t.title}</div><div className="text-xs text-muted">{[t.gameLabel, t.scope].filter(Boolean).join(" · ")}</div></div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${t.status === "DONE" ? "bg-emerald-100 text-emerald-700" : t.status === "SIGNUP" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>{t.status === "DONE" ? "complete" : t.status === "SIGNUP" ? "sign-ups open" : "active"}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm() {
  const create = useCreateTournament();
  const navigate = useNavigate();
  const people = useTaskPeople();
  const nodes = useOrgNodes();
  const groups = useGroupsList();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("PICK");
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("");
  const [scopeKind, setScopeKind] = useState<"ALL" | "NODE" | "GROUP">("NODE");
  const [scopeId, setScopeId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [joinPolicy, setJoinPolicy] = useState<"OPEN" | "APPLY">("OPEN");
  const [requirements, setRequirements] = useState("");
  const [err, setErr] = useState("");

  const scopeOk = scopeKind === "ALL" || !!scopeId;
  const valid = title.trim() && scopeOk && (mode !== "PICK" || picked.length >= 2);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function submit() {
    if (!valid) return;
    setErr("");
    const sc = { title: title.trim(), gameLabel: game.trim() || undefined, scopeKind, scopeId: scopeKind === "ALL" ? null : scopeId };
    const v: CreateTournament = mode === "PICK" ? { mode, ...sc, playerIds: picked } : mode === "QUICK" ? { mode, ...sc } : { mode, ...sc, joinPolicy, requirements: requirements.trim() || undefined };
    create.mutate(v, {
      onSuccess: (r) => navigate(`/tournaments/${r.id}`),
      onError: (e: unknown) => setErr((e as { message?: string })?.message === "not_enough_people" ? "That scope has fewer than 2 people." : (e as { message?: string })?.message === "forbidden" ? "You can't run org-wide tournaments." : "Couldn't create — try again."),
    });
  }

  if (!open) return <Card className="mb-4"><button onClick={() => setOpen(true)} className="text-sm font-medium text-primary">+ New tournament</button></Card>;

  return (
    <Card className="mb-4 space-y-2">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-muted">New tournament</h2><button onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">cancel</button></div>
      <div className="flex rounded-lg border border-border p-0.5 text-xs">
        {([["PICK", "Pick players"], ["QUICK", "Quick (whole dept/team)"], ["SIGNUP", "Open sign-ups"]] as [Mode, string][]).map(([m, l]) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md px-2 py-1.5 ${mode === m ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input className="flex-1" placeholder="Title (e.g. Office Checkers Cup)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input className="w-40" placeholder="Game" value={game} onChange={(e) => setGame(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={scopeKind} onChange={(e) => { setScopeKind(e.target.value as "ALL" | "NODE" | "GROUP"); setScopeId(""); }} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="NODE">Department</option><option value="GROUP">Team</option><option value="ALL">Org-wide</option>
        </select>
        {scopeKind === "NODE" && <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="">Which department?</option>{(nodes.data?.nodes ?? []).filter((n) => n.nodeType !== "ORG").map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>}
        {scopeKind === "GROUP" && <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="">Which team?</option>{(groups.data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
      </div>
      {mode === "QUICK" && <p className="text-xs text-muted">Everyone in the chosen scope is entered and randomly seeded — starts immediately.</p>}
      {mode === "SIGNUP" && (
        <div className="space-y-2">
          <select value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value as "OPEN" | "APPLY")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="OPEN">Anyone in scope can join</option><option value="APPLY">People apply, you approve</option></select>
          <Input placeholder="Requirements / details for entrants (optional)" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
        </div>
      )}
      {mode === "PICK" && (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">Entrants ({picked.length})</div>
          <div className="max-h-44 overflow-auto rounded-lg border border-border p-2">
            {(people.data?.people ?? []).map((p) => <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}</label>)}
          </div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button disabled={!valid || create.isPending} onClick={submit}>{mode === "SIGNUP" ? "Open sign-ups" : "Create bracket"}</Button>
    </Card>
  );
}
