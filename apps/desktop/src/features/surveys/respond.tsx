import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type AnswerValue, type SQuestion, useRespond, useSaveResponse, useSubmitResponse } from "../../lib/surveys";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const ticketKey = (id: string) => `ces-survey-ticket-${id}`;

export function SurveyRespondPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<string | null>(() => localStorage.getItem(ticketKey(id)));
  const { data, isLoading } = useRespond(id, ticket);
  const save = useSaveResponse(id);
  const submit = useSubmitResponse(id);

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Seed local state from any saved progress (once loaded).
  useEffect(() => {
    if (!data?.response) return;
    setAnswers(Object.fromEntries(data.response.answers.map((a) => [a.questionId, a.value])));
    setPage(data.response.page ?? 0);
    if (data.response.status === "SUBMITTED") setDone(true);
  }, [data?.response]);

  const perPage = data?.survey.perPage ?? 5;
  const pages = useMemo(() => {
    const qs = data?.questions ?? [];
    const out: SQuestion[][] = [];
    for (let i = 0; i < qs.length; i += perPage) out.push(qs.slice(i, i + perPage));
    return out;
  }, [data?.questions, perPage]);

  if (isLoading) return <p className="p-4 text-sm text-muted">Loading…</p>;
  if (!data) return <p className="p-4 text-sm text-muted">This survey isn't open to you.</p>;
  if (done) {
    return (
      <div className="max-w-2xl">
        <PageHeader title={data.survey.title} />
        <Card><p className="text-sm">✅ Thanks — your response has been submitted.</p><button onClick={() => navigate("/surveys")} className="mt-2 text-sm text-primary hover:underline">Back to surveys</button></Card>
      </div>
    );
  }

  const current = pages[page] ?? [];
  const isLast = page >= pages.length - 1;
  const setAnswer = (qid: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [qid]: v }));

  async function persist(nextPage: number) {
    const payload = current.map((q) => ({ questionId: q.id, value: answers[q.id] ?? {} }));
    const res = await save.mutateAsync({ ticket: ticket ?? undefined, page: nextPage, answers: payload });
    if (res.ticket && res.ticket !== ticket) { localStorage.setItem(ticketKey(id), res.ticket); setTicket(res.ticket); }
    return res.ticket ?? ticket ?? undefined;
  }

  async function next() { setErr(""); await persist(page + 1); setPage((p) => p + 1); }
  async function back() { setErr(""); await persist(Math.max(0, page - 1)); setPage((p) => Math.max(0, p - 1)); }
  async function finish() {
    setErr("");
    const tk = await persist(page);
    const r = await submit.mutateAsync(tk);
    if (r.ok) { localStorage.removeItem(ticketKey(id)); setDone(true); }
  }

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate("/surveys")} className="mb-3 text-sm text-primary hover:underline">← Surveys</button>
      <PageHeader title={data.survey.title} subtitle={`${data.survey.anonymity === "ANON" ? "Anonymous — no identity is stored. " : ""}Page ${page + 1} of ${pages.length}`} />
      {data.survey.description && page === 0 && <Card className="mb-4"><p className="text-sm text-muted">{data.survey.description}</p></Card>}

      <div className="space-y-3">
        {current.map((q) => (
          <div key={q.id}>
            {q.sectionId && data.sectionTitles[q.sectionId] && <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-muted/70">{data.sectionTitles[q.sectionId]}</h3>}
            <QuestionInput q={q} value={answers[q.id] ?? {}} onChange={(v) => setAnswer(q.id, v)} />
          </div>
        ))}
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={page === 0 || save.isPending}>Back</Button>
        {isLast
          ? <Button onClick={() => finish().catch(() => setErr("Please answer the required questions."))} disabled={save.isPending || submit.isPending}>Submit</Button>
          : <Button onClick={() => next()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Next"}</Button>}
      </div>
      <p className="mt-2 text-xs text-muted">Your progress is saved as you go — you can close and come back.</p>
    </div>
  );
}

export function QuestionInput({ q, value, onChange }: { q: SQuestion; value: AnswerValue; onChange: (v: AnswerValue) => void }) {
  return (
    <Card>
      <div className="mb-2 text-sm font-medium">{q.prompt}{q.required && <span className="text-red-600"> *</span>}</div>
      {q.type === "TEXT" && (
        <textarea value={value.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} rows={3} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      )}
      {q.type === "SCALE" && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => onChange({ scale: n })} className={`h-9 w-9 rounded-lg border text-sm ${value.scale === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-border/40"}`}>{n}</button>
          ))}
        </div>
      )}
      {q.type === "SINGLE" && (
        <div className="space-y-1">
          {q.options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 text-sm"><input type="radio" name={q.id} checked={value.choice === i} onChange={() => onChange({ choice: i })} /> {opt}</label>
          ))}
          {q.allowOther && <OtherField checked={value.choice === -1} other={value.other} onPick={() => onChange({ choice: -1, other: value.other ?? "" })} onText={(t) => onChange({ choice: -1, other: t })} radio name={q.id} />}
        </div>
      )}
      {q.type === "MULTI" && (
        <div className="space-y-1">
          {q.options.map((opt, i) => {
            const set = new Set(value.choices ?? []);
            return <label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={set.has(i)} onChange={(e) => { e.target.checked ? set.add(i) : set.delete(i); onChange({ ...value, choices: [...set].sort((a, b) => a - b) }); }} /> {opt}</label>;
          })}
          {q.allowOther && <OtherField checked={value.other != null} other={value.other} onPick={() => onChange({ ...value, other: value.other ?? "" })} onText={(t) => onChange({ ...value, other: t })} />}
        </div>
      )}
    </Card>
  );
}

function OtherField({ checked, other, onPick, onText, radio, name }: { checked: boolean; other?: string; onPick: () => void; onText: (t: string) => void; radio?: boolean; name?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <input type={radio ? "radio" : "checkbox"} name={name} checked={checked} onChange={onPick} /> Other:
      <Input value={other ?? ""} onChange={(e) => onText(e.target.value)} placeholder="your answer" className="h-7 flex-1" />
    </div>
  );
}
