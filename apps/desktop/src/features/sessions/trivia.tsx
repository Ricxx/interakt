import { useEffect, useRef, useState } from "react";
import { type CurrentActivity, useActivityAction, useTriviaAction, useTriviaSubmit } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

export function TriviaView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const t = activity.trivia!;
  const submit = useTriviaSubmit(sessionId, activity.id);
  const close = useTriviaAction(sessionId, activity.id, "close");
  const reveal = useTriviaAction(sessionId, activity.id, "reveal");
  const end = useActivityAction(sessionId, "end");

  const init = t.mySubmission;
  const [format, setFormat] = useState(init?.format ?? "OPEN");
  const [prompt, setPrompt] = useState(init?.prompt ?? "");
  const [answer, setAnswer] = useState(init?.answer ?? "");
  const [options, setOptions] = useState<string[]>(init?.options ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState(init?.correctIndex ?? 0);

  // COLLECTING countdown → auto-close at the deadline (any client, idempotent).
  const [secs, setSecs] = useState(0);
  const fired = useRef(false);
  const deadlineMs = t.deadline ? new Date(t.deadline).getTime() : null;
  useEffect(() => {
    if (t.phase !== "COLLECTING" || deadlineMs === null) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [t.phase, deadlineMs]);
  useEffect(() => {
    if (t.phase === "COLLECTING" && deadlineMs !== null && secs === 0 && !fired.current) {
      fired.current = true;
      close.mutate();
    }
  }, [secs]); // eslint-disable-line react-hooks/exhaustive-deps

  function doSubmit() {
    if (!prompt.trim()) return;
    if (format === "MC") {
      if (options.some((o) => !o.trim())) return;
      submit.mutate({ format: "MC", prompt: prompt.trim(), options: options.map((o) => o.trim()), correctIndex: correct });
    } else {
      submit.mutate({ format: "OPEN", prompt: prompt.trim(), answer: answer.trim() || null });
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-muted">Team trivia</div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {t.phase === "COLLECTING" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Write one thing about yourself for teammates to guess — a fact or a question, open or multiple-choice. When the timer's up you'll each be handed someone else's to guess aloud.
          </p>
          <div className="text-sm font-medium">{deadlineMs !== null ? `${secs}s to submit` : "Submit when ready — the host will close it."}</div>

          <div className="space-y-2">
            <div className="flex gap-1 rounded-lg bg-bg p-0.5 text-xs">
              <button onClick={() => setFormat("OPEN")} className={cn("flex-1 rounded-md py-1 font-medium", format === "OPEN" ? "bg-primary/10 text-primary" : "text-muted")}>Open</button>
              <button onClick={() => setFormat("MC")} className={cn("flex-1 rounded-md py-1 font-medium", format === "MC" ? "bg-primary/10 text-primary" : "text-muted")}>Multiple choice</button>
            </div>
            <Input placeholder="Your fact or question (e.g. 'Which of these have I done?')" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            {format === "OPEN" ? (
              <Input placeholder="The answer (shown at the reveal — optional)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            ) : (
              <div className="space-y-1">
                {options.map((o, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} title="Correct answer" />
                    <Input placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1" />
                  </label>
                ))}
                <div className="text-xs text-muted">Select the radio next to the correct option.</div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={doSubmit} disabled={submit.isPending || !prompt.trim()}>{init ? "Update" : "Submit"}</Button>
              {init && <span className="text-xs text-emerald-600">✓ submitted — edit until time's up</span>}
            </div>
          </div>

          <div className="text-xs text-muted">Submitted: {t.submittedCount}{t.joinedCount ? ` of ${t.joinedCount}` : ""}{t.submitters.length > 0 && ` · ${t.submitters.join(", ")}`}</div>
          {canControl && <Button variant="ghost" onClick={() => close.mutate()} disabled={close.isPending || t.submittedCount === 0}>Close &amp; assign now</Button>}
        </div>
      ) : t.phase === "ASSIGNED" ? (
        <div className="space-y-4">
          {t.myAssignment ? (
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Guess about</div>
              <div className="text-lg font-semibold">{t.myAssignment.authorName}</div>
              <div className="mt-1">{t.myAssignment.prompt}</div>
              {t.myAssignment.options && (
                <ol className="mt-2 list-inside list-decimal text-sm">
                  {t.myAssignment.options.map((o, i) => <li key={i}>{o}</li>)}
                </ol>
              )}
              <div className="mt-2 text-xs text-muted">Make your guess out loud!</div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t.submittedCount} prompt{t.submittedCount === 1 ? "" : "s"} are being guessed — listen in!</p>
          )}
          {canControl && <Button onClick={() => reveal.mutate()} disabled={reveal.isPending}>Reveal answers</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-semibold">The answers</div>
          {(t.reveal ?? []).map((r, i) => (
            <div key={i} className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">{r.authorName}</div>
              <div className="text-muted">{r.prompt}</div>
              {r.options ? (
                <ol className="mt-1 list-inside list-decimal">
                  {r.options.map((o, j) => <li key={j} className={cn(j === r.correctIndex && "font-semibold text-emerald-600")}>{o}{j === r.correctIndex ? " ✓" : ""}</li>)}
                </ol>
              ) : (
                r.answer && <div className="mt-1">Answer: <span className="font-medium">{r.answer}</span></div>
              )}
            </div>
          ))}
          {(t.reveal ?? []).length === 0 && <p className="text-sm text-muted">No submissions.</p>}
        </div>
      )}
    </Card>
  );
}
