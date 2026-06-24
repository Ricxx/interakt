import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Mode, useCreateScoreboard, useScoreboards } from "../../lib/scoreboard";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export function ScoreboardsPage() {
  const { data } = useScoreboards();
  const create = useCreateScoreboard();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("SOLO");

  const submit = () => {
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), mode }, { onSuccess: (r) => { setOpen(false); setTitle(""); navigate(`/scoreboards/${r.id}`); } });
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Scoreboards" subtitle="Live points standings for real-world games — cornhole, field day, retreats. Solo or teams; scan a QR to watch." />

      <Card className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted">{data?.scoreboards.length ?? 0} scoreboard{data?.scoreboards.length === 1 ? "" : "s"}</span>
        {!open && <Button onClick={() => setOpen(true)}>+ New scoreboard</Button>}
      </Card>

      {open && (
        <Card className="mb-4 space-y-2 border-primary/30 bg-primary/5">
          <Input placeholder="Title (e.g. Summer Retreat Games)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex items-center gap-2">
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <option value="SOLO">Solo — individuals compete</option>
              <option value="TEAM">Teams — named teams compete</option>
            </select>
            <Button disabled={!title.trim() || create.isPending} onClick={submit}>Create</Button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">Cancel</button>
          </div>
        </Card>
      )}

      {data && data.scoreboards.length === 0 ? (
        <Card><p className="text-sm text-muted">No scoreboards yet — create one for your next event.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data?.scoreboards.map((s) => (
            <button key={s.id} onClick={() => navigate(`/scoreboards/${s.id}`)} className="rounded-xl border border-border bg-surface p-4 text-left hover:border-primary/50">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">🏆 {s.title}</span>
                <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs text-muted">{s.mode === "TEAM" ? "Teams" : "Solo"}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{s.entrants} {s.mode === "TEAM" ? "teams" : "players"}{s.leader ? ` · leader: ${s.leader}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
