import { type CurrentActivity, useActivityAction, usePokerReveal, usePokerVote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

// Planning Poker — everyone picks a card hidden; the host reveals all at once. Shows who's voted before
// the reveal (not what), then the spread + a consensus banner after.
export function PokerView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const p = activity.poker!;
  const vote = usePokerVote(sessionId, activity.id);
  const reveal = usePokerReveal(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const maxBar = Math.max(1, ...(p.distribution ?? []).map((d) => d.count));

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">🃏 {p.prompt}</h2>
          <p className="text-xs text-muted">{p.revealed ? "revealed" : `${p.votedCount} voted — hidden`}</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {!p.revealed && (
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          {p.deck.map((card) => (
            <button
              key={card}
              onClick={() => vote.mutate(card)}
              disabled={vote.isPending}
              className={cn("flex h-14 w-10 items-center justify-center rounded-lg border-2 text-base font-semibold", p.myCard === card ? "border-primary bg-primary/10 text-primary" : "border-border text-fg hover:border-primary/50")}
            >
              {card}
            </button>
          ))}
        </div>
      )}

      {p.consensus && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700">🎉 Consensus!</div>}

      {p.revealed && p.distribution && (
        <div className="mb-3 space-y-1">
          {p.distribution.map((d) => (
            <div key={d.card} className="flex items-center gap-2 text-xs text-muted">
              <span className="w-5 text-right font-semibold text-fg">{d.card}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border/60"><div className="h-full rounded-full bg-primary" style={{ width: `${(d.count / maxBar) * 100}%` }} /></div>
              <span className="w-5 text-right">{d.count}</span>
            </div>
          ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {p.voters.map((v, i) => (
          <li key={i} className="flex items-center gap-1 rounded-full bg-border/50 px-2 py-0.5 text-xs text-fg">
            {v.name}{v.card ? <span className="font-semibold text-primary">{v.card}</span> : <span className="text-emerald-600">✓</span>}
          </li>
        ))}
        {p.voters.length === 0 && <li className="text-xs text-muted">No votes yet.</li>}
      </ul>

      {canControl && (
        <div className="mt-3 flex gap-2">
          {!p.revealed ? (
            <Button onClick={() => reveal.mutate(false)} disabled={p.votedCount === 0 || reveal.isPending}>Reveal</Button>
          ) : (
            <Button variant="subtle" onClick={() => reveal.mutate(true)} disabled={reveal.isPending}>Re-estimate</Button>
          )}
        </div>
      )}
    </Card>
  );
}
