import { type CurrentActivity, useMoveTeam, useReshuffleTeams } from "../../lib/sessions";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

const TEAM_COLOR = ["bg-indigo-500", "bg-cyan-600", "bg-amber-600", "bg-rose-500", "bg-emerald-600", "bg-fuchsia-600"];

// Team selector: the room split into N teams (random), with host reshuffle + manual moves.
export function TeamSelectView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const t = activity.teams;
  const reshuffle = useReshuffleTeams(sessionId, activity.id);
  const move = useMoveTeam(sessionId, activity.id);
  if (!t) return null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{activity.title || "Teams"}</h3>
          <p className="mt-0.5 text-sm text-muted">{t.teamCount} teams{t.myTeam != null ? ` · you're on Team ${t.myTeam + 1}` : ""}</p>
        </div>
        {canControl && <Button variant="ghost" onClick={() => reshuffle.mutate()} disabled={reshuffle.isPending}>🔀 Reshuffle</Button>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {t.teams.map((team) => (
          <div key={team.index} className={`rounded-lg border p-3 ${team.index === t.myTeam ? "border-primary" : "border-border"}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${TEAM_COLOR[team.index % TEAM_COLOR.length]}`} />
              <span className="text-sm font-semibold">{team.name}</span>
              <span className="text-xs text-muted">({team.members.length})</span>
            </div>
            <ul className="space-y-1">
              {team.members.length === 0 && <li className="text-xs text-muted">—</li>}
              {team.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{m.name}</span>
                  {canControl && (
                    <select
                      value={team.index}
                      onChange={(e) => move.mutate({ userId: m.id, teamIndex: Number(e.target.value) })}
                      className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
                      title="Move to team"
                    >
                      {t.teams.map((dst) => <option key={dst.index} value={dst.index}>{dst.name}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
