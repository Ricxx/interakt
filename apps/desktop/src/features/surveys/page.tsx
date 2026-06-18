import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAssignedSurveys, useCopySurvey, useCreateSurvey, useDeleteSurvey, useInsights, useSurveys } from "../../lib/surveys";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const STATUS_STYLE: Record<string, string> = { DRAFT: "bg-border/60 text-muted", OPEN: "bg-emerald-100 text-emerald-700", PAUSED: "bg-amber-100 text-amber-700", CLOSED: "bg-border/60 text-muted" };

export function SurveysPage() {
  const [tab, setTab] = useState<"create" | "complete" | "insights">("create");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Surveys" subtitle="Build and distribute surveys, complete ones sent to you, or read shared insights." />
      <div className="mb-4 flex gap-1 border-b border-border">
        {([["create", "Create"], ["complete", "To complete"], ["insights", "Insights"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>{label}</button>
        ))}
      </div>
      {tab === "create" ? <CreateTab /> : tab === "complete" ? <CompleteTab /> : <InsightsTab />}
    </div>
  );
}

function InsightsTab() {
  const navigate = useNavigate();
  const { data } = useInsights();
  const insights = (data?.insights ?? []).filter((i) => i.published);
  return (
    <div className="space-y-3">
      {insights.length === 0 && <Card><p className="text-sm text-muted">No shared insights yet. Survey owners publish analysis + resolutions here.</p></Card>}
      {insights.map((i) => (
        <Card key={i.id}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold">{i.title}</h3>
            <button onClick={() => navigate(`/surveys/${i.surveyId}/results`)} className="shrink-0 text-xs text-primary hover:underline">From: {i.surveyTitle}</button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{i.body}</p>
          <p className="mt-2 text-xs text-muted">— {i.byName}</p>
        </Card>
      ))}
    </div>
  );
}

function CompleteTab() {
  const navigate = useNavigate();
  const { data } = useAssignedSurveys();
  const surveys = data?.surveys ?? [];
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-muted">Sent to you</h2>
      {surveys.length === 0 && <p className="text-sm text-muted">Nothing to complete right now.</p>}
      <ul className="divide-y divide-border">
        {surveys.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-3">
            <span className="flex items-center gap-2">
              <span className="font-medium">{s.title}</span>
              <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{s.anonymity === "ANON" ? "anonymous" : "named"}</span>
              <span className="text-xs text-muted">· {s.questions} question{s.questions === 1 ? "" : "s"}</span>
            </span>
            <button onClick={() => navigate(`/surveys/${s.id}/respond`)} className="text-sm text-primary hover:underline">Open</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CreateTab() {
  const navigate = useNavigate();
  const { data } = useSurveys();
  const create = useCreateSurvey();
  const copy = useCopySurvey();
  const del = useDeleteSurvey();
  const [title, setTitle] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(title.trim(), { onSuccess: (r) => { setTitle(""); navigate(`/surveys/${r.survey.id}`); } });
  }

  const surveys = data?.surveys ?? [];

  return (
    <>
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">New survey</h2>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input placeholder="Survey title (e.g. Q3 Pulse Check)" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 min-w-48" />
          <Button type="submit" disabled={create.isPending || !title.trim()}>Create</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">My surveys</h2>
        {surveys.length === 0 && <p className="text-sm text-muted">No surveys yet. Create one above.</p>}
        <ul className="divide-y divide-border">
          {surveys.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-3">
              <button onClick={() => navigate(`/surveys/${s.id}`)} className="flex flex-1 items-center gap-2 text-left hover:opacity-80">
                <span className="font-medium">{s.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[s.status] ?? ""}`}>{s.status.toLowerCase()}</span>
                <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{s.anonymity === "ANON" ? "anonymous" : "named"}</span>
                <span className="text-xs text-muted">· {s.questions} question{s.questions === 1 ? "" : "s"}</span>
              </button>
              <span className="flex shrink-0 items-center gap-3 text-xs">
                {s.status !== "DRAFT" && <button onClick={() => navigate(`/surveys/${s.id}/results`)} className="text-primary hover:underline">Results</button>}
                <button onClick={() => copy.mutate(s.id, { onSuccess: (r) => navigate(`/surveys/${r.survey.id}`) })} className="text-primary hover:underline">Copy</button>
                {s.status === "DRAFT" && <button onClick={() => del.mutate(s.id)} className="text-red-600 hover:underline">Delete</button>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
