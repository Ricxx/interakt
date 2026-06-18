import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type QuizQuestion, useAddQuizQuestion, useDeleteQuizQuestion, useMoveQuizQuestion, useQuiz, useUpdateQuiz, useUpdateQuizQuestion } from "../../lib/quizzes";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const TYPES = [
  { v: "MC", label: "Multiple choice" },
  { v: "TF", label: "True / False" },
  { v: "TYPE_ANSWER", label: "Type the answer" },
  { v: "PUZZLE", label: "Put in order" },
  { v: "SLIDER", label: "Number / slider" },
];
const POINTS = ["STANDARD", "DOUBLE", "NONE"];

export function QuizBuilderPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuiz(id);
  const updateQuiz = useUpdateQuiz(id);
  const addQ = useAddQuizQuestion(id);
  const [type, setType] = useState("MC");

  if (isLoading) return <p className="p-4 text-sm text-muted">Loading…</p>;
  if (!data) return <p className="p-4 text-sm text-muted">Quiz not found.</p>;
  const { quiz, questions } = data;

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate("/quizzes")} className="mb-3 text-sm text-primary hover:underline">← All quizzes</button>
      <PageHeader title={quiz.title} subtitle="Build it once; launch it live in a session any time." />
      <Card className="mb-6 space-y-2">
        <Input defaultValue={quiz.title} onBlur={(e) => e.target.value.trim() && e.target.value !== quiz.title && updateQuiz.mutate({ title: e.target.value.trim() })} placeholder="Title" />
        <textarea defaultValue={quiz.description ?? ""} onBlur={(e) => e.target.value !== (quiz.description ?? "") && updateQuiz.mutate({ description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      </Card>

      <div className="space-y-3">
        {questions.map((q, i) => <QuestionEditor key={q.id} quizId={id} q={q} n={i + 1} first={i === 0} last={i === questions.length - 1} />)}
      </div>

      <Card className="mt-4 flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
        <Button onClick={() => addQ.mutate(type)} disabled={addQ.isPending}>+ Add question</Button>
      </Card>
    </div>
  );
}

function QuestionEditor({ quizId, q, n, first, last }: { quizId: string; q: QuizQuestion; n: number; first: boolean; last: boolean }) {
  const update = useUpdateQuizQuestion(quizId);
  const del = useDeleteQuizQuestion(quizId);
  const move = useMoveQuizQuestion(quizId);
  const set = (patch: Partial<QuizQuestion>) => update.mutate({ qid: q.id, ...patch });
  const setOptions = (options: string[]) => set({ options, ...(q.type === "PUZZLE" ? { correct: { order: options.map((_, i) => i) } } : {}) });

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{n}. {TYPES.find((t) => t.v === q.type)?.label}</span>
        <span className="ml-auto flex items-center gap-1 text-muted">
          <button onClick={() => move.mutate({ qid: q.id, dir: "up" })} disabled={first} className="px-1 hover:text-fg disabled:opacity-30">↑</button>
          <button onClick={() => move.mutate({ qid: q.id, dir: "down" })} disabled={last} className="px-1 hover:text-fg disabled:opacity-30">↓</button>
          <button onClick={() => del.mutate(q.id)} className="px-1 hover:text-red-600">×</button>
        </span>
      </div>
      <input defaultValue={q.prompt} onBlur={(e) => e.target.value.trim() && e.target.value !== q.prompt && set({ prompt: e.target.value.trim() })} className="w-full rounded border border-border bg-surface px-2 py-1 text-sm font-medium" />

      {q.type === "MC" && <McEditor q={q} setOptions={setOptions} setCorrect={(indices) => set({ correct: { indices } })} />}
      {q.type === "TF" && (
        <div className="flex gap-2 text-sm">
          {[true, false].map((b) => <button key={String(b)} onClick={() => set({ correct: { bool: b } })} className={`rounded-lg border px-3 py-1 ${q.correct.bool === b ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{b ? "True" : "False"} {q.correct.bool === b && "✓"}</button>)}
        </div>
      )}
      {q.type === "TYPE_ANSWER" && <TextAnswers texts={q.correct.texts ?? []} onChange={(texts) => set({ correct: { texts } })} />}
      {q.type === "PUZZLE" && <PuzzleEditor options={q.options} setOptions={setOptions} />}
      {q.type === "SLIDER" && <SliderEditor c={q.correct} onChange={(correct) => set({ correct })} />}

      <Media q={q} onChange={(mediaKind, mediaUrl) => set({ mediaKind, mediaUrl })} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex items-center gap-1">Time<Input type="number" min={5} max={300} defaultValue={q.timeLimitSec} onBlur={(e) => Number(e.target.value) !== q.timeLimitSec && set({ timeLimitSec: Number(e.target.value) })} className="h-7 w-16" />s</label>
        <label className="flex items-center gap-1">Points<select value={q.points} onChange={(e) => set({ points: e.target.value })} className="rounded border border-border bg-surface px-1 py-0.5">{POINTS.map((p) => <option key={p} value={p}>{p.toLowerCase()}</option>)}</select></label>
      </div>
    </Card>
  );
}

function McEditor({ q, setOptions, setCorrect }: { q: QuizQuestion; setOptions: (o: string[]) => void; setCorrect: (i: number[]) => void }) {
  const correct = new Set(q.correct.indices ?? []);
  const toggle = (i: number) => { correct.has(i) ? correct.delete(i) : correct.add(i); setCorrect([...correct].sort((a, b) => a - b)); };
  return (
    <div className="space-y-1">
      {q.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="checkbox" checked={correct.has(i)} onChange={() => toggle(i)} title="Correct?" />
          <input defaultValue={opt} onBlur={(e) => { if (e.target.value !== opt) setOptions(q.options.map((o, j) => (j === i ? e.target.value : o))); }} className="flex-1 rounded border border-border bg-surface px-2 py-0.5 text-sm" />
          {q.options.length > 2 && <button onClick={() => setOptions(q.options.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">×</button>}
        </div>
      ))}
      {q.options.length < 8 && <button onClick={() => setOptions([...q.options, `Option ${q.options.length + 1}`])} className="text-xs text-primary hover:underline">+ add option</button>}
      <p className="text-xs text-muted">Tick every correct answer.</p>
    </div>
  );
}

function TextAnswers({ texts, onChange }: { texts: string[]; onChange: (t: string[]) => void }) {
  return (
    <div className="space-y-1">
      {texts.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input defaultValue={t} onBlur={(e) => { if (e.target.value !== t) onChange(texts.map((x, j) => (j === i ? e.target.value : x))); }} className="flex-1 rounded border border-border bg-surface px-2 py-0.5 text-sm" placeholder="accepted answer" />
          {texts.length > 1 && <button onClick={() => onChange(texts.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">×</button>}
        </div>
      ))}
      <button onClick={() => onChange([...texts, ""])} className="text-xs text-primary hover:underline">+ accept another spelling</button>
    </div>
  );
}

function PuzzleEditor({ options, setOptions }: { options: string[]; setOptions: (o: string[]) => void }) {
  const swap = (i: number, j: number) => { if (j < 0 || j >= options.length) return; const a = [...options]; [a[i], a[j]] = [a[j], a[i]]; setOptions(a); };
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted">List items in the correct order (players see them shuffled).</p>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted">{i + 1}.</span>
          <input defaultValue={opt} onBlur={(e) => { if (e.target.value !== opt) setOptions(options.map((o, j) => (j === i ? e.target.value : o))); }} className="flex-1 rounded border border-border bg-surface px-2 py-0.5 text-sm" />
          <button onClick={() => swap(i, i - 1)} disabled={i === 0} className="text-muted hover:text-fg disabled:opacity-30">↑</button>
          <button onClick={() => swap(i, i + 1)} disabled={i === options.length - 1} className="text-muted hover:text-fg disabled:opacity-30">↓</button>
          {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">×</button>}
        </div>
      ))}
      {options.length < 8 && <button onClick={() => setOptions([...options, `Item ${options.length + 1}`])} className="text-xs text-primary hover:underline">+ add item</button>}
    </div>
  );
}

function SliderEditor({ c, onChange }: { c: QuizQuestion["correct"]; onChange: (c: QuizQuestion["correct"]) => void }) {
  const num = (k: "min" | "max" | "value" | "tolerance", def: number) => (
    <label className="flex items-center gap-1">{k}<Input type="number" defaultValue={c[k] ?? def} onBlur={(e) => onChange({ ...c, [k]: Number(e.target.value) })} className="h-7 w-20" /></label>
  );
  return <div className="flex flex-wrap gap-3 text-xs text-muted">{num("min", 0)}{num("max", 100)}{num("value", 50)}{num("tolerance", 0)}</div>;
}

const MEDIA_KINDS = [["", "No media"], ["IMAGE", "Image"], ["VIDEO", "Video"], ["AUDIO", "Audio"]] as const;
function Media({ q, onChange }: { q: QuizQuestion; onChange: (kind: string | null, url: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <select value={q.mediaKind ?? ""} onChange={(e) => onChange(e.target.value || null, e.target.value ? q.mediaUrl : null)} className="rounded border border-border bg-surface px-1 py-0.5">
        {MEDIA_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {q.mediaKind && <Input placeholder="media URL (image / YouTube / audio)" defaultValue={q.mediaUrl ?? ""} onBlur={(e) => e.target.value !== (q.mediaUrl ?? "") && onChange(q.mediaKind, e.target.value || null)} className="h-7 flex-1 min-w-48" />}
    </div>
  );
}
