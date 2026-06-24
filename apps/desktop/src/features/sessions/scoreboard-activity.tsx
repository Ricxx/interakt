import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CurrentActivity, useActivityAction } from "../../lib/sessions";
import { api } from "../../lib/api";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";

const MEDAL = ["🥇", "🥈", "🥉"];

// In-session scoreboard — shows a chosen board's live standings to the whole room. The host can also
// top up points right here, picking a person from the room (or by name), without leaving the meeting.
export function ScoreboardActivityView({ sessionId, canControl, activity, joined }: { sessionId: string; canControl: boolean; activity: CurrentActivity; joined: { userId: string; name: string }[] }) {
  const sb = activity.scoreboard;
  const end = useActivityAction(sessionId, "end");
  const navigate = useNavigate();

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">🏆 {sb ? sb.title : activity.title}</h2>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {!sb ? (
        <p className="text-sm text-muted">That scoreboard is no longer available.</p>
      ) : (
        <>
          {sb.standings.length === 0 ? (
            <p className="text-sm text-muted">No {sb.mode === "TEAM" ? "teams" : "players"} on the board yet.</p>
          ) : (
            <ul className="space-y-1">
              {sb.standings.map((st, i) => (
                <li key={st.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="w-7 text-center text-lg">{MEDAL[i] ?? <span className="text-sm text-muted">{st.rank}</span>}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-fg">{st.name}</div>
                    {sb.games.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-[11px] text-muted">
                        {sb.games.filter((g) => st.perGame[g]).map((g) => <span key={g} className="rounded bg-border/50 px-1.5 py-0.5">{g}: {st.perGame[g]}</span>)}
                      </div>
                    )}
                  </div>
                  <span className="text-lg font-bold tabular-nums text-primary">{st.total}</span>
                </li>
              ))}
            </ul>
          )}

          {canControl && <Award sessionId={sessionId} sb={sb} joined={joined} />}
          {canControl && <button onClick={() => navigate(`/scoreboards/${sb.id}`)} className="mt-3 text-xs text-primary hover:underline">Open full scoreboard →</button>}
        </>
      )}
    </Card>
  );
}

type Sb = NonNullable<CurrentActivity["scoreboard"]>;

function Award({ sessionId, sb, joined }: { sessionId: string; sb: Sb; joined: { userId: string; name: string }[] }) {
  const qc = useQueryClient();
  const award = useMutation({
    mutationFn: (v: { entrantId?: string; name?: string; game: string; points: number }) =>
      v.entrantId
        ? api(`/api/scoreboards/${sb.id}/scores`, { method: "POST", body: JSON.stringify({ entrantId: v.entrantId, game: v.game, points: v.points }) })
        : api(`/api/scoreboards/${sb.id}/scores-by-name`, { method: "POST", body: JSON.stringify({ name: v.name, game: v.game, points: v.points }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
  const [who, setWho] = useState("");
  const [team, setTeam] = useState("");
  const [game, setGame] = useState("");
  const [points, setPoints] = useState("1");

  const isTeam = sb.mode === "TEAM";
  // For solo boards: room people + existing entrants make the autocomplete; the host can also type a name.
  const names = [...new Set([...joined.map((j) => j.name), ...sb.standings.map((s) => s.name)])].sort();

  const submit = () => {
    const pts = Number(points);
    if (!pts) return;
    if (isTeam) { if (!team) return; award.mutate({ entrantId: team, game: game.trim(), points: pts }, { onSuccess: () => setPoints("1") }); }
    else { const name = who.trim(); if (!name) return; award.mutate({ name, game: game.trim(), points: pts }, { onSuccess: () => { setPoints("1"); } }); }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-border/10 p-2">
      <div className="mb-1 text-xs font-semibold text-muted">Award points</div>
      <div className="flex flex-wrap items-center gap-2">
        {isTeam ? (
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
            <option value="">Which team?</option>
            {sb.standings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <>
            <Input className="w-40" placeholder="Who? (room or name)" value={who} onChange={(e) => setWho(e.target.value)} list="sb-room-people" />
            <datalist id="sb-room-people">{names.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        )}
        <Input className="w-36" placeholder="Game (optional)" value={game} onChange={(e) => setGame(e.target.value)} list="sb-act-games" />
        <datalist id="sb-act-games">{sb.games.map((g) => <option key={g} value={g} />)}</datalist>
        <Input className="w-20" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
        <Button onClick={submit} disabled={award.isPending || (isTeam ? !team : !who.trim())}>+ Points</Button>
      </div>
    </div>
  );
}
