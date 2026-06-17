import { useEffect, useState } from "react";
import { type CurrentActivity, useActivityAction, useSelectWinner, useUpdateActivityConfig, useVote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

export function NominationView({
  sessionId,
  canControl,
  activity,
  joined,
}: {
  sessionId: string;
  canControl: boolean;
  activity: CurrentActivity;
  joined: { userId: string; name: string }[];
}) {
  const vote = useVote(sessionId);
  const selectWinner = useSelectWinner(sessionId);
  const updateConfig = useUpdateActivityConfig(sessionId);
  const end = useActivityAction(sessionId, "end");

  const n = activity.nomination;
  const tally = n?.tally ?? [];
  const myVote = n?.myVote ?? null;
  const total = n?.totalVotes ?? 0;
  const winner = activity.picks[activity.picks.length - 1];
  const maxCount = Math.max(1, ...tally.map((t) => t.count));

  // Voting countdown (if a timer was set).
  const [now, setNow] = useState(() => Date.now());
  const endsAt = n?.votingEndsAt ? new Date(n.votingEndsAt).getTime() : null;
  useEffect(() => {
    if (!endsAt || winner) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [endsAt, winner]);
  const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const closed = !!winner || (secondsLeft !== null && secondsLeft <= 0);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">
          {activity.title}
          <span className="ml-2 text-xs font-normal">{n?.anonymous ? "· anonymous" : "· named"}</span>
        </h2>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {secondsLeft !== null && !winner && (
        <div className="mb-3 text-sm">{closed ? "Voting closed." : `Voting closes in ${secondsLeft}s`}</div>
      )}

      {winner && (
        <div className="mb-4 flex min-h-20 items-center justify-center rounded-lg border-2 border-primary/50 bg-primary/5 p-5 text-center">
          <div key={winner.userId} style={{ animation: "ces-pop 0.4s ease-out" }}>
            <div className="text-xs uppercase tracking-wide text-muted">selected</div>
            <div className="text-3xl font-bold">{winner.name}</div>
          </div>
        </div>
      )}

      {!canControl && !closed && (
        <>
          <div className="mb-2 text-xs font-semibold text-muted">Vote for who goes next</div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {joined.map((p) => (
              <button
                key={p.userId}
                onClick={() => vote.mutate({ activityId: activity.id, nomineeId: p.userId })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  myVote === p.userId ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-border/50",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Tally — hidden from participants until the host reveals */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">Tally · {total} vote{total === 1 ? "" : "s"}</span>
        {canControl && (
          <button onClick={() => updateConfig.mutate({ activityId: activity.id, showCounts: !n?.showCounts })} className="text-xs text-primary hover:underline">
            {n?.showCounts ? "Hide from participants" : "Reveal to all"}
          </button>
        )}
      </div>
      {n?.tallyHidden ? (
        <p className="text-sm text-muted">Results hidden until the host reveals them.</p>
      ) : (
        <div className="space-y-1">
          {tally.length === 0 && <p className="text-sm text-muted">No votes yet.</p>}
          {tally.map((t) => (
            <div key={t.userId}>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-28 truncate">{t.name}</span>
                <div className="h-3 flex-1 rounded bg-border/40">
                  <div className="h-full rounded bg-primary" style={{ width: `${(t.count / maxCount) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-xs text-muted">{t.count}</span>
              </div>
              {!n?.anonymous && t.voters.length > 0 && (
                <div className="ml-28 pl-2 text-xs text-muted">{t.voters.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {canControl && !winner && (
        <Button className="mt-4" onClick={() => selectWinner.mutate(activity.id)} disabled={total === 0 || selectWinner.isPending}>
          Close &amp; select winner
        </Button>
      )}
    </Card>
  );
}
