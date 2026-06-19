import { type CurrentActivity, useActivityAction, useFistVote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

// Fist of Five — one-tap 1–5 confidence/temperature check. Tap a number; the room average and the
// distribution update live. 1 = no confidence, 5 = fully on board.
export function FistOfFiveView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const f = activity.fist!;
  const vote = useFistVote(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const maxBar = Math.max(1, ...f.distribution.map((d) => d.count));

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">✋ {f.prompt}</h2>
          <p className="text-xs text-muted">{f.count} voted{f.count > 0 ? ` · avg ${f.average.toFixed(1)}` : ""}</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="mb-4 flex justify-center gap-2">
        {f.distribution.map((d) => (
          <button
            key={d.value}
            onClick={() => vote.mutate(d.value)}
            disabled={vote.isPending}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl border-2 text-lg font-semibold",
              f.myVote === d.value ? "border-primary bg-primary/10 text-primary" : "border-border text-fg hover:border-primary/50",
            )}
          >
            {d.value}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {f.distribution.map((d) => (
          <div key={d.value} className="flex items-center gap-2 text-xs text-muted">
            <span className="w-4 text-right">{d.value}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border/60">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(d.count / maxBar) * 100}%` }} />
            </div>
            <span className="w-5 text-right">{d.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
