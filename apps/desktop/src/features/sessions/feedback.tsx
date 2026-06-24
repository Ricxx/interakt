import { useEffect, useState } from "react";
import { type CurrentActivity, useActivityAction, useFeedbackControl, useFeedbackVote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

const MEDAL = ["🥇", "🥈", "🥉"];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Feedback review — open the (anonymous) suggestion/complaint box in the room, run a timed vote, then
// the issues sort top-down by votes. An objective way to surface what the team most wants fixed.
export function FeedbackView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const f = activity.feedback!;
  const vote = useFeedbackVote(sessionId, activity.id);
  const ctrl = useFeedbackControl(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");

  const [, force] = useState(0);
  useEffect(() => {
    if (!f.timer.running) return;
    const iv = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, [f.timer.running, f.timer.endsAt]);
  const remaining = f.timer.running && f.timer.endsAt ? Math.max(0, Math.round((new Date(f.timer.endsAt).getTime() - Date.now()) / 1000)) : null;
  const voting = remaining !== null && remaining > 0;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">{f.kind === "COMPLAINT" ? "🛡️" : "💡"} {activity.title}</h2>
          <p className="text-xs text-muted">{f.kind === "COMPLAINT" ? "Complaints" : "Suggestions"} · {f.scope} · {f.total} item{f.total === 1 ? "" : "s"} · all anonymous</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="mb-3 rounded-lg border border-border bg-primary/5 py-2 text-center">
        {voting ? (
          <div className="text-lg font-bold tabular-nums text-primary">⏱️ {fmt(remaining)} — vote for what matters!</div>
        ) : remaining === 0 ? (
          <div className="text-sm font-medium text-fg">⏰ Voting closed — final ranking below</div>
        ) : (
          <div className="text-sm text-muted">Upvote the items you care about{canControl ? " — or start a timed vote" : ""}.</div>
        )}
      </div>

      {f.items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">This box is empty.</p>
      ) : (
        <ol className="space-y-2">
          {f.items.map((item, i) => (
            <li key={item.id} className={cn("flex items-start gap-2 rounded-lg border p-2", f.spotlight === i ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border")}>
              <button
                onClick={() => vote.mutate(item.id)}
                disabled={remaining === 0}
                className={cn("flex w-11 shrink-0 flex-col items-center rounded-md border px-1 py-1 text-xs disabled:opacity-50", item.myVote ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/50")}
              >
                <span className="leading-none">▲</span><span className="font-semibold">{item.votes}</span>
              </button>
              <div className="min-w-0 flex-1">
                <span className="mr-1">{MEDAL[i] ?? ""}</span>
                <span className="text-sm text-fg">{item.body}</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {canControl && f.items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {f.timer.running ? (
            <Button variant="subtle" onClick={() => ctrl.mutate({ action: "stop" })}>Stop vote</Button>
          ) : (
            <Button onClick={() => ctrl.mutate({ action: "start" })}>Start {Math.round(f.timer.seconds / 60) || 1}m vote</Button>
          )}
          <span className="ml-2 text-xs text-muted">Focus:</span>
          <button onClick={() => ctrl.mutate({ action: "spotlight", index: Math.max(0, (f.spotlight < 0 ? 0 : f.spotlight) - 1) })} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-fg">←</button>
          <button onClick={() => ctrl.mutate({ action: "spotlight", index: f.spotlight < 0 ? 0 : Math.min(f.total - 1, f.spotlight + 1) })} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-fg">→</button>
          {f.spotlight >= 0 && <button onClick={() => ctrl.mutate({ action: "spotlight", index: -1 })} className="text-xs text-muted hover:text-fg">clear</button>}
        </div>
      )}
    </Card>
  );
}
