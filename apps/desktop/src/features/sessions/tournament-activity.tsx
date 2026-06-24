import { useNavigate } from "react-router-dom";
import { type CurrentActivity, useActivityAction } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

function roundLabel(round: number, total: number) {
  if (round === total - 1) return "Final";
  if (round === total - 2) return "Semifinals";
  if (round === total - 3) return "Quarterfinals";
  return `Round ${round + 1}`;
}

// In-session tournament — the room watches a chosen bracket live; the host reports results on the
// full Tournaments page. "Tournaments deployed and viewed in the session."
export function TournamentActivityView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const t = activity.tournament;
  const end = useActivityAction(sessionId, "end");
  const navigate = useNavigate();
  const total = t?.rounds.length ?? 0;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">🏆 {t ? t.title : activity.title}{t?.gameLabel ? <span className="ml-1 text-xs font-normal text-muted">· {t.gameLabel}</span> : null}</h2>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {!t ? (
        <p className="text-sm text-muted">That tournament is no longer available.</p>
      ) : t.rounds.length === 0 ? (
        <p className="text-sm text-muted">The bracket hasn't started yet{canControl ? " — start it on the Tournaments page." : "."}</p>
      ) : (
        <>
          {t.champion && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-700">🏆 Champion: {t.champion}</div>}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {t.rounds.map((rnd) => (
              <div key={rnd.round} className="min-w-44 shrink-0">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted/70">{roundLabel(rnd.round, total)}</div>
                <div className="space-y-2">
                  {rnd.matches.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border bg-surface p-1.5 text-sm">
                      {[{ name: m.p1, won: !!m.winner && m.winner === m.p1 }, { name: m.p2, won: !!m.winner && m.winner === m.p2 }].map((side, i) => (
                        <div key={i} className={cn("truncate rounded px-2 py-1", side.won ? "bg-emerald-50 font-semibold text-emerald-700" : m.winner ? "text-muted line-through" : "text-fg")}>
                          {side.name ?? <span className="italic text-muted/60">TBD</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {canControl && t && <button onClick={() => navigate(`/tournaments/${t.id}`)} className="mt-3 text-xs text-primary hover:underline">Open full tournament to report results →</button>}
    </Card>
  );
}
