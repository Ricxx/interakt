import { useState } from "react";
import { type CurrentActivity, useSaveSurveyAnswer, useSubmitSurvey } from "../../lib/sessions";
import type { AnswerValue } from "../../lib/surveys";
import { QuestionInput } from "../surveys/respond";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

const ticketKey = (aid: string) => `ces-actsurvey-${aid}`;

// In-meeting survey: a mini single-page form everyone in the room fills live.
export function SurveyActivityView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const sv = activity.survey;
  const save = useSaveSurveyAnswer(activity.id);
  const submit = useSubmitSurvey(sessionId, activity.id);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [doneLocal, setDoneLocal] = useState(false);
  const [err, setErr] = useState("");
  if (!sv) return null;

  const submitted = sv.myStatus === "SUBMITTED" || doneLocal;

  async function finish() {
    setErr("");
    const ticket = localStorage.getItem(ticketKey(activity.id)) ?? undefined;
    try {
      const r = await save.mutateAsync({ ticket, answers: sv!.questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? {} })) });
      if (r.ticket) localStorage.setItem(ticketKey(activity.id), r.ticket);
      await submit.mutateAsync(r.ticket ?? ticket);
      setDoneLocal(true);
    } catch {
      setErr("Please answer the required questions.");
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{sv.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{sv.anonymity === "ANON" ? "Anonymous — no identity stored. " : ""}{canControl ? `${sv.submittedCount} submitted` : ""}</p>
        </div>
      </div>

      {submitted ? (
        <p className="mt-3 text-sm">✅ Thanks — your response is in.{canControl ? ` (${sv.submittedCount} total)` : ""}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {sv.questions.map((q) => (
            <QuestionInput key={q.id} q={{ ...q, sectionId: null }} value={answers[q.id] ?? {}} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ))}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button onClick={finish} disabled={save.isPending || submit.isPending}>Submit</Button>
        </div>
      )}
    </Card>
  );
}
