import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCopyQuiz, useCreateQuiz, useDeleteQuiz, useQuizzes } from "../../lib/quizzes";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export function QuizzesPage() {
  const navigate = useNavigate();
  const { data } = useQuizzes();
  const create = useCreateQuiz();
  const copy = useCopyQuiz();
  const del = useDeleteQuiz();
  const [title, setTitle] = useState("");
  const quizzes = data?.quizzes ?? [];

  return (
    <div className="max-w-2xl">
      <PageHeader title="Quizzes" subtitle="Build Kahoot-style quizzes once and run them live in any session." />
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">New quiz</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(title.trim(), { onSuccess: (r) => { setTitle(""); navigate(`/quizzes/${r.quiz.id}`); } }); }} className="flex flex-wrap items-center gap-2">
          <Input placeholder="Quiz title (e.g. Onboarding Trivia)" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 min-w-48" />
          <Button type="submit" disabled={create.isPending || !title.trim()}>Create</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">My quizzes</h2>
        {quizzes.length === 0 && <p className="text-sm text-muted">No quizzes yet. Build one above, then launch it as a Quiz activity in a session.</p>}
        <ul className="divide-y divide-border">
          {quizzes.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 py-3">
              <button onClick={() => navigate(`/quizzes/${q.id}`)} className="flex flex-1 items-center gap-2 text-left hover:opacity-80">
                <span className="font-medium">{q.title}</span>
                <span className="text-xs text-muted">· {q.questions} question{q.questions === 1 ? "" : "s"}</span>
              </button>
              <span className="flex shrink-0 items-center gap-3 text-xs">
                <button onClick={() => copy.mutate(q.id, { onSuccess: (r) => navigate(`/quizzes/${r.quiz.id}`) })} className="text-primary hover:underline">Copy</button>
                <button onClick={() => del.mutate(q.id)} className="text-red-600 hover:underline">Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
