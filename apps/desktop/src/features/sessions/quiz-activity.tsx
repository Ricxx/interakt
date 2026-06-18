import { useEffect, useState } from "react";
import { type CurrentActivity, type QuizActivity, useQuizAdvance, useQuizAnswer } from "../../lib/sessions";
import { youtubeEmbed } from "../../lib/artifacts";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const SHAPE = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-fuchsia-500", "bg-cyan-500", "bg-orange-500", "bg-lime-500"];

export function QuizActivityView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const q = activity.quiz;
  const advance = useQuizAdvance(sessionId, activity.id);
  if (!q) return <Card><p className="text-sm text-muted">Loading quiz…</p></Card>;

  const advanceLabel = q.phase === "LOBBY" ? "Start" : q.phase === "QUESTION" ? "Reveal answer" : q.phase === "REVEAL" ? (q.isLast ? "Final results" : "Next question") : null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{q.title}</h3>
          {q.phase !== "LOBBY" && q.phase !== "PODIUM" && <p className="text-sm text-muted">Question {q.idx + 1} of {q.total}</p>}
        </div>
        {canControl && advanceLabel && <Button onClick={() => advance.mutate()} disabled={advance.isPending}>{advanceLabel}</Button>}
      </div>

      {q.phase === "LOBBY" && <p className="mt-4 text-sm text-muted">Get ready! {canControl ? "Press Start when everyone's in." : "Waiting for the host to start…"}</p>}
      {q.phase === "QUESTION" && <QuestionPhase sessionId={sessionId} activityId={activity.id} canControl={canControl} q={q} />}
      {q.phase === "REVEAL" && <RevealPhase q={q} />}
      {q.phase === "PODIUM" && <Podium q={q} />}
    </Card>
  );
}

function Media({ kind, url }: { kind: string | null; url: string | null }) {
  if (!kind || !url) return null;
  if (kind === "IMAGE") return <img src={url} alt="" className="mt-3 max-h-56 rounded-lg border border-border" />;
  if (kind === "AUDIO") return <audio src={url} controls className="mt-3 w-full" />;
  const embed = youtubeEmbed(url);
  return embed
    ? <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg border border-border"><iframe src={embed} title="media" className="h-full w-full" allowFullScreen /></div>
    : <video src={url} controls className="mt-3 max-h-56 w-full rounded-lg" />;
}

function Countdown({ deadline }: { deadline: string | null }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${left <= 5 ? "bg-red-100 text-red-600" : "bg-border/60 text-muted"}`}>{left}s</span>;
}

function QuestionPhase({ sessionId, activityId, canControl, q }: { sessionId: string; activityId: string; canControl: boolean; q: QuizActivity }) {
  const ans = useQuizAnswer(sessionId, activityId);
  const qq = q.question!;
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [text, setText] = useState("");
  const [order, setOrder] = useState<number[]>(qq.optionIdx ?? []);
  const [slider, setSlider] = useState<number>(qq.slider ? Math.round((qq.slider.min + qq.slider.max) / 2) : 0);

  const locked = q.myAnswered;
  const submit = (answer: unknown) => ans.mutate(answer);

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-lg font-semibold">{qq.prompt}</div>
        <Countdown deadline={qq.deadline} />
      </div>
      <Media kind={qq.mediaKind} url={qq.mediaUrl} />

      {locked ? (
        <p className="mt-4 text-sm text-emerald-600">✅ Answer locked — waiting for the reveal.{canControl ? ` (${q.answerCount ?? 0} answered)` : ""}</p>
      ) : (
        <div className="mt-4">
          {qq.type === "MC" && (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {qq.options.map((o, i) => (
                  <button key={i} onClick={() => setPicked((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; })} className={`rounded-lg p-3 text-left text-sm font-medium text-white ${SHAPE[i % SHAPE.length]} ${picked.has(i) ? "ring-2 ring-fg" : "opacity-90"}`}>{o}</button>
                ))}
              </div>
              <Button className="mt-3" onClick={() => submit({ indices: [...picked].sort((a, b) => a - b) })} disabled={ans.isPending || picked.size === 0}>Lock answer</Button>
            </>
          )}
          {qq.type === "TF" && (
            <div className="flex gap-2">
              <Button onClick={() => submit({ bool: true })} disabled={ans.isPending}>True</Button>
              <Button variant="ghost" onClick={() => submit({ bool: false })} disabled={ans.isPending}>False</Button>
            </div>
          )}
          {qq.type === "TYPE_ANSWER" && (
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit({ text: text.trim() }); }} className="flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" className="flex-1" autoFocus />
              <Button type="submit" disabled={ans.isPending || !text.trim()}>Submit</Button>
            </form>
          )}
          {qq.type === "PUZZLE" && (
            <>
              <p className="mb-1 text-xs text-muted">Put these in the right order:</p>
              <ul className="space-y-1">
                {order.map((origIdx, pos) => (
                  <li key={origIdx} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                    <span className="text-muted">{pos + 1}.</span>
                    <span className="flex-1">{qq.options[(qq.optionIdx ?? []).indexOf(origIdx)]}</span>
                    <button onClick={() => setOrder((a) => { const n = [...a]; if (pos > 0) [n[pos - 1], n[pos]] = [n[pos], n[pos - 1]]; return n; })} disabled={pos === 0} className="px-1 text-muted disabled:opacity-30">↑</button>
                    <button onClick={() => setOrder((a) => { const n = [...a]; if (pos < a.length - 1) [n[pos + 1], n[pos]] = [n[pos], n[pos + 1]]; return n; })} disabled={pos === order.length - 1} className="px-1 text-muted disabled:opacity-30">↓</button>
                  </li>
                ))}
              </ul>
              <Button className="mt-3" onClick={() => submit({ order })} disabled={ans.isPending}>Lock order</Button>
            </>
          )}
          {qq.type === "SLIDER" && qq.slider && (
            <div className="flex items-center gap-3">
              <input type="range" min={qq.slider.min} max={qq.slider.max} value={slider} onChange={(e) => setSlider(Number(e.target.value))} className="flex-1" />
              <span className="w-12 text-right font-semibold">{slider}</span>
              <Button onClick={() => submit({ value: slider })} disabled={ans.isPending}>Lock</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RevealPhase({ q }: { q: QuizActivity }) {
  const qq = q.question!;
  const maxOpt = Math.max(1, ...(q.distribution?.perOption ?? [1]));
  return (
    <div className="mt-3">
      <div className="text-lg font-semibold">{qq.prompt}</div>
      <p className="mt-1 text-sm"><span className="text-muted">Correct answer:</span> <span className="font-semibold text-emerald-600">{q.answerText}</span></p>
      {q.myResult && <p className={`mt-1 text-sm font-medium ${q.myResult.correct ? "text-emerald-600" : "text-red-600"}`}>{q.myResult.correct ? `✅ Correct — +${q.myResult.points}` : "❌ Not this time"}</p>}

      {q.distribution?.perOption ? (
        <div className="mt-3 flex items-end justify-center gap-2" style={{ height: 100 }}>
          {q.distribution.perOption.map((c, i) => (
            <div key={i} className="flex w-12 flex-col items-center justify-end">
              <span className="mb-1 text-xs text-muted">{c}</span>
              <div className={`w-8 rounded-t ${SHAPE[i % SHAPE.length]}`} style={{ height: `${20 + (c / maxOpt) * 70}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{q.distribution?.correctCount ?? 0} of {q.distribution?.total ?? 0} got it right.</p>
      )}

      <Leaderboard rows={q.leaderboard ?? []} />
    </div>
  );
}

function Leaderboard({ rows }: { rows: NonNullable<QuizActivity["leaderboard"]> }) {
  if (rows.length === 0) return null;
  return (
    <ol className="mt-4 space-y-1">
      {rows.map((r) => (
        <li key={r.rank} className="flex items-center justify-between rounded-lg bg-bg px-3 py-1.5 text-sm">
          <span><span className="mr-2 font-semibold text-muted">{r.rank}</span>{r.name}</span>
          <span className="font-semibold">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}

function Podium({ q }: { q: QuizActivity }) {
  const rows = q.leaderboard ?? [];
  return (
    <div className="mt-3">
      {rows[0] && <p className="text-center text-lg font-semibold">🏆 {rows[0].name} wins!</p>}
      <Leaderboard rows={rows} />
    </div>
  );
}
