import { useState } from "react";
import { type CurrentActivity, useActivityAction, useQnaAnswered, useQnaAsk, useQnaUpvote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

// Slido-style Q&A: anyone in the room asks, everyone upvotes, the host marks questions answered.
// Open questions float to the top by votes; answered ones sink and dim.
export function QnaView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const q = activity.qna!;
  const ask = useQnaAsk(sessionId, activity.id);
  const upvote = useQnaUpvote(sessionId, activity.id);
  const answered = useQnaAnswered(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const [text, setText] = useState("");

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    ask.mutate(body, { onSuccess: () => setText("") });
  };

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">💬 {activity.title}</h2>
          <p className="text-xs text-muted">{q.open} open · {q.total} total{q.anonymous ? " · anonymous" : ""}</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          maxLength={500}
          placeholder="Ask a question…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button onClick={submit} disabled={!text.trim() || ask.isPending}>Ask</Button>
      </div>

      {q.questions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No questions yet — be the first to ask.</p>
      ) : (
        <ul className="space-y-2">
          {q.questions.map((item) => (
            <li key={item.id} className={cn("flex items-start gap-2 rounded-lg border border-border p-2", item.answered && "opacity-55")}>
              <button
                onClick={() => upvote.mutate(item.id)}
                className={cn("flex w-11 shrink-0 flex-col items-center rounded-md border px-1 py-1 text-xs", item.myUpvote ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/50")}
                title={item.myUpvote ? "Remove your upvote" : "Upvote"}
              >
                <span className="leading-none">▲</span>
                <span className="font-semibold">{item.upvotes}</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm text-fg", item.answered && "line-through")}>{item.body}</p>
                <p className="text-xs text-muted">{item.authorName ?? (item.mine ? "You (anonymous)" : "Anonymous")}{item.answered ? " · answered" : ""}</p>
              </div>
              {canControl && (
                <button
                  onClick={() => answered.mutate({ qid: item.id, answered: !item.answered })}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  {item.answered ? "reopen" : "mark answered"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
