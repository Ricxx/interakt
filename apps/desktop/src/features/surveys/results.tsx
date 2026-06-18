import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type QResult, type SurveyInsight, downloadSurveyCsv, useCreateInsight, useDeleteInsight, useSurveyInsights, useSurveyResults, useUpdateInsight } from "../../lib/surveys";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export function SurveyResultsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useSurveyResults(id);
  const [exporting, setExporting] = useState(false);

  if (isLoading) return <p className="p-4 text-sm text-muted">Loading…</p>;
  if (!data) return <p className="p-4 text-sm text-muted">Results not available.</p>;

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate("/surveys")} className="mb-3 text-sm text-primary hover:underline">← Surveys</button>
      <div className="flex items-start justify-between gap-2">
        <PageHeader title="Results" subtitle={`${data.submitted} response${data.submitted === 1 ? "" : "s"}${data.anonymity === "ANON" ? " · anonymous" : ""}`} />
        {!data.locked && data.submitted > 0 && (
          <Button variant="ghost" disabled={exporting} onClick={() => { setExporting(true); downloadSurveyCsv(id).finally(() => setExporting(false)); }}>
            {exporting ? "…" : "Export CSV"}
          </Button>
        )}
      </div>

      {data.locked ? (
        <Card><p className="text-sm text-muted">🔒 Results stay hidden until <strong>{data.k}</strong> people respond ({data.submitted} so far). This protects anonymity — individual answers can't be singled out.</p></Card>
      ) : data.submitted === 0 ? (
        <Card><p className="text-sm text-muted">No responses yet.</p></Card>
      ) : (
        <div className="space-y-3">
          {(data.questions ?? []).map((q) => <QuestionResult key={q.id} q={q} total={data.submitted} />)}
        </div>
      )}

      <InsightsSection surveyId={id} />
    </div>
  );
}

// Institution-authored analysis + resolutions; publish to share in the Insights tab.
function InsightsSection({ surveyId }: { surveyId: string }) {
  const { data } = useSurveyInsights(surveyId);
  const create = useCreateInsight(surveyId);
  const [title, setTitle] = useState("");
  if (!data) return null;
  const insights = data.insights;

  return (
    <div className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-muted">Insights</h2>
      {insights.length === 0 && !data.isOwner && <Card><p className="text-sm text-muted">No insights shared yet.</p></Card>}
      <div className="space-y-3">
        {insights.map((i) => <InsightCard key={i.id} surveyId={surveyId} insight={i} canEdit={data.isOwner} />)}
      </div>
      {data.isOwner && (
        <Card className="mt-3 flex flex-wrap items-center gap-2">
          <Input placeholder="New insight title (analysis, resolutions…)" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 min-w-48" />
          <Button onClick={() => title.trim() && create.mutate({ title: title.trim() }, { onSuccess: () => setTitle("") })} disabled={create.isPending || !title.trim()}>+ Add insight</Button>
        </Card>
      )}
    </div>
  );
}

function InsightCard({ surveyId, insight, canEdit }: { surveyId: string; insight: SurveyInsight; canEdit: boolean }) {
  const update = useUpdateInsight(surveyId);
  const del = useDeleteInsight(surveyId);
  if (!canEdit) {
    return <Card><div className="text-sm font-semibold">{insight.title}</div><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{insight.body}</p></Card>;
  }
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <input defaultValue={insight.title} onBlur={(e) => e.target.value.trim() && e.target.value !== insight.title && update.mutate({ insId: insight.id, title: e.target.value.trim() })} className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm font-semibold" />
        <span className={`rounded px-1.5 py-0.5 text-xs ${insight.published ? "bg-emerald-100 text-emerald-700" : "bg-border/60 text-muted"}`}>{insight.published ? "published" : "draft"}</span>
        <button onClick={() => del.mutate(insight.id)} className="text-muted hover:text-red-600" title="Delete">×</button>
      </div>
      <textarea defaultValue={insight.body} onBlur={(e) => e.target.value !== insight.body && update.mutate({ insId: insight.id, body: e.target.value })} rows={4} placeholder="What the data shows, potential solutions, resolutions, next steps…" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <Button variant="ghost" onClick={() => update.mutate({ insId: insight.id, published: !insight.published })} disabled={update.isPending}>{insight.published ? "Unpublish" : "Publish to Insights"}</Button>
    </Card>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="w-32 truncate">{label}</span>
      <div className="h-2 flex-1 rounded bg-border/40"><div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} /></div>
      <span className="w-14 text-right text-muted">{count} · {pct}%</span>
    </li>
  );
}

function QuestionResult({ q, total }: { q: QResult; total: number }) {
  return (
    <Card>
      <div className="mb-2 text-sm font-medium">{q.prompt} <span className="text-xs font-normal text-muted">· {q.answered} answered</span></div>
      {(q.type === "SINGLE" || q.type === "MULTI") && (
        <ul className="space-y-1">
          {q.options.map((opt, i) => <Bar key={i} label={opt} count={q.counts?.[i] ?? 0} total={total} />)}
          {(q.otherCount ?? 0) > 0 && <Bar label="Other" count={q.otherCount ?? 0} total={total} />}
          {(q.otherTexts ?? []).length > 0 && <li className="ml-2 mt-1 text-xs text-muted">Other: {q.otherTexts!.map((t) => `“${t}”`).join(", ")}</li>}
        </ul>
      )}
      {q.type === "SCALE" && (
        <div>
          <ul className="space-y-1">{[1, 2, 3, 4, 5].map((n) => <Bar key={n} label={String(n)} count={q.dist?.[n - 1] ?? 0} total={total} />)}</ul>
          {q.average != null && <p className="mt-1 text-xs text-muted">Average: {q.average}</p>}
        </div>
      )}
      {q.type === "TEXT" && (
        <ul className="space-y-1 text-sm">
          {(q.texts ?? []).length === 0 && <li className="text-muted">No text answers.</li>}
          {(q.texts ?? []).map((t, i) => <li key={i} className="rounded bg-bg px-2 py-1">{t}</li>)}
        </ul>
      )}
    </Card>
  );
}
