import { type CurrentActivity, useActivityAction, useDotAllocate } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

// Dot voting / prioritization — spend a budget of dots across the options. Totals build up live;
// the leading option is highlighted. Each voter nudges their own dots with − / +.
export function DotVoteView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const d = activity.dot!;
  const allocate = useDotAllocate(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");

  const max = Math.max(1, ...d.options.map((o) => o.dots));
  const leader = Math.max(...d.options.map((o) => o.dots));

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">🔵 {d.question}</h2>
          <p className="text-xs text-muted">{d.myRemaining} of {d.budget} dots left · {d.voterCount} voted · {d.totalDots} dots placed</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <ul className="space-y-2">
        {d.options.map((o) => {
          const leading = o.dots > 0 && o.dots === leader;
          return (
            <li key={o.index} className="rounded-lg border border-border p-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-fg">{leading && "🏆 "}{o.label}</span>
                <span className="shrink-0 text-xs text-muted">{o.dots} dot{o.dots === 1 ? "" : "s"}</span>
              </div>
              <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-border/60">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(o.dots / max) * 100}%` }} />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => allocate.mutate({ optionIndex: o.index, dots: o.mine - 1 })}
                  disabled={o.mine === 0 || allocate.isPending}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted hover:border-primary/50 disabled:opacity-40"
                >−</button>
                <span className="w-16 text-center text-muted">you: <span className="font-semibold text-fg">{o.mine}</span></span>
                <button
                  onClick={() => allocate.mutate({ optionIndex: o.index, dots: o.mine + 1 })}
                  disabled={d.myRemaining === 0 || allocate.isPending}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted hover:border-primary/50 disabled:opacity-40"
                >+</button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
