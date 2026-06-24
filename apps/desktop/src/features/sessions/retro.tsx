import { useState } from "react";
import { type CurrentActivity, type RetroColumn, useActivityAction, useRetroAddCard, useRetroDeleteCard, useRetroVote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

// Retrospective board — add cards under each column, upvote to surface the top points. Works for any
// team's review (Start/Stop/Continue, Went well/To improve, etc.); anonymous mode hides authors.
export function RetroView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const r = activity.retro!;
  const end = useActivityAction(sessionId, "end");

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">🔄 {activity.title}</h2>
          <p className="text-xs text-muted">Add cards, upvote what matters{r.anonymous ? " · anonymous" : ""}</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${r.columns.length}, minmax(0, 1fr))` }}>
        {r.columns.map((col) => <Column key={col.index} sessionId={sessionId} activityId={activity.id} col={col} />)}
      </div>
    </Card>
  );
}

function Column({ sessionId, activityId, col }: { sessionId: string; activityId: string; col: RetroColumn }) {
  const add = useRetroAddCard(sessionId, activityId);
  const vote = useRetroVote(sessionId, activityId);
  const del = useRetroDeleteCard(sessionId, activityId);
  const [text, setText] = useState("");
  const submit = () => { const body = text.trim(); if (!body) return; add.mutate({ column: col.index, body }, { onSuccess: () => setText("") }); };

  return (
    <div className="rounded-lg border border-border bg-border/10 p-2">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{col.title}</h3>
      <div className="mb-2 flex gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          maxLength={300}
          placeholder="Add a card…"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs"
        />
        <button onClick={submit} disabled={!text.trim() || add.isPending} className="shrink-0 rounded-md bg-primary px-2 text-xs font-medium text-primary-fg disabled:opacity-40">+</button>
      </div>
      <ul className="space-y-1.5">
        {col.cards.map((c) => (
          <li key={c.id} className="rounded-md border border-border bg-surface p-2">
            <p className="text-sm text-fg">{c.body}</p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
              <button
                onClick={() => vote.mutate(c.id)}
                className={cn("flex items-center gap-0.5 rounded px-1", c.myVote ? "text-primary" : "hover:text-primary")}
                title={c.myVote ? "Remove your vote" : "Upvote"}
              >▲ {c.votes}</button>
              <span className="flex-1 truncate">{c.authorName ?? (c.mine ? "you (anon)" : "anon")}</span>
              {c.canDelete && <button onClick={() => del.mutate(c.id)} className="hover:text-red-600" title="Delete">✕</button>}
            </div>
          </li>
        ))}
        {col.cards.length === 0 && <li className="py-2 text-center text-[11px] text-muted/50">—</li>}
      </ul>
    </div>
  );
}
