import { type CurrentActivity, useActivityAction, useRoundAction } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

// Round-robin / go-around — a shuffled turn order for stand-ups and icebreakers. The host advances,
// and whoever's up can tap "I'm done" to pass it on.
export function RoundRobinView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const r = activity.round!;
  const act = useRoundAction(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">🔁 {activity.title}</h2>
          <p className="text-xs text-muted">{Math.min(r.index, r.total)} of {r.total} done</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="mb-3 rounded-lg border border-border bg-primary/5 py-4 text-center">
        {r.finished ? (
          <div className="text-lg font-semibold text-emerald-600">✓ Everyone's had a turn</div>
        ) : (
          <>
            <div className="text-xs uppercase tracking-wide text-muted">Now up</div>
            <div className="text-2xl font-bold text-fg">{r.currentName}{r.currentMine && <span className="text-primary"> (you)</span>}</div>
          </>
        )}
      </div>

      <ol className="mb-3 space-y-0.5">
        {r.items.map((it, i) => (
          <li key={i} className={cn("flex items-center gap-2 rounded px-2 py-1 text-sm", it.current && "bg-primary/10 font-semibold text-primary", it.done && "text-muted line-through")}>
            <span className="w-5 text-right text-xs text-muted">{it.done ? "✓" : i + 1}</span>
            <span className="flex-1 truncate">{it.name}{it.mine && !it.current && <span className="text-muted"> (you)</span>}</span>
            {it.current && <span className="text-xs">🎤</span>}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {r.currentMine && !r.finished && <Button onClick={() => act.mutate("next")}>I'm done →</Button>}
        {canControl && (
          <>
            <Button variant="subtle" onClick={() => act.mutate("prev")} disabled={r.index === 0}>← Back</Button>
            <Button variant="subtle" onClick={() => act.mutate("next")} disabled={r.finished}>Next →</Button>
            <button onClick={() => act.mutate("restart")} className="text-xs text-muted hover:text-primary">↺ Reshuffle</button>
          </>
        )}
      </div>
    </Card>
  );
}
