import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { type ScopeRef, type SQuestion, type SurveyDetail, type SurveySection, useAddCollaborator, useAddQuestion, useAddSection, useDeleteQuestion, useDeleteSection, useMoveQuestion, useRemoveCollaborator, useSurvey, useSurveyAction, useSurveyEdits, useUpdateQuestion, useUpdateSection, useUpdateSurvey } from "../../lib/surveys";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

type OrgNode = { id: string; name: string; path: string };
type Group = { id: string; name: string };

const TYPES = [
  { v: "SINGLE", label: "Single choice" },
  { v: "MULTI", label: "Multiple choice" },
  { v: "TEXT", label: "Free text" },
  { v: "SCALE", label: "Scale 1–5" },
];
const isChoice = (t: string) => t === "SINGLE" || t === "MULTI";

export function SurveyBuilderPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useSurvey(id);
  const updateSurvey = useUpdateSurvey(id);
  const addQ = useAddQuestion(id);
  const launch = useSurveyAction(id, "launch");
  const pause = useSurveyAction(id, "pause");
  const resume = useSurveyAction(id, "resume");
  const close = useSurveyAction(id, "close");
  const { data: orgData } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const { data: groupData } = useQuery({ queryKey: ["groups"], queryFn: () => api<{ groups: Group[] }>("/api/groups") });
  const [newType, setNewType] = useState("SINGLE");

  if (isLoading) return <p className="p-4 text-sm text-muted">Loading…</p>;
  if (!data) return <p className="p-4 text-sm text-muted">Survey not found.</p>;
  const { survey, questions } = data;
  const editable = survey.status === "DRAFT";
  const nodes = (orgData?.nodes ?? []).filter((n) => n.path !== "org");
  const groups = groupData?.groups ?? [];

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate("/surveys")} className="mb-3 text-sm text-primary hover:underline">← All surveys</button>
      <div className="flex items-start justify-between gap-2">
        <PageHeader title={survey.title} subtitle={editable ? "Draft — edit freely, set distribution, then launch." : `${survey.status.toLowerCase()} — structure is locked.`} />
        <div className="mt-1 flex shrink-0 items-center gap-2">
          {survey.status !== "DRAFT" && <Button variant="ghost" onClick={() => navigate(`/surveys/${id}/results`)}>Results</Button>}
          {survey.status === "DRAFT" && <Button onClick={() => launch.mutate()} disabled={launch.isPending || !survey.scopeKind || questions.length === 0}>Launch</Button>}
          {survey.status === "OPEN" && <><Button variant="ghost" onClick={() => pause.mutate()} disabled={pause.isPending}>Pause</Button><Button variant="ghost" onClick={() => close.mutate()} disabled={close.isPending}>Close</Button></>}
          {survey.status === "PAUSED" && <><Button onClick={() => resume.mutate()} disabled={resume.isPending}>Resume</Button><Button variant="ghost" onClick={() => close.mutate()} disabled={close.isPending}>Close</Button></>}
        </div>
      </div>

      <Card className="mb-6 space-y-3">
        <Input defaultValue={survey.title} disabled={!editable} onBlur={(e) => e.target.value.trim() && e.target.value !== survey.title && updateSurvey.mutate({ title: e.target.value.trim() })} placeholder="Title" />
        <textarea defaultValue={survey.description ?? ""} disabled={!editable} onBlur={(e) => e.target.value !== (survey.description ?? "") && updateSurvey.mutate({ description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Responses
            <select value={survey.anonymity} disabled={!editable} onChange={(e) => updateSurvey.mutate({ anonymity: e.target.value })} className="rounded border border-border bg-surface px-2 py-1">
              <option value="NAMED">Named</option>
              <option value="ANON">Anonymous</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Per page
            <Input type="number" min={1} max={50} defaultValue={survey.perPage} disabled={!editable} onBlur={(e) => Number(e.target.value) !== survey.perPage && updateSurvey.mutate({ perPage: Number(e.target.value) })} className="w-20" />
          </label>
        </div>
        {survey.anonymity === "ANON" && <p className="text-xs text-muted">Anonymous: no identity is stored with responses; results show only at k≥5.</p>}
      </Card>

      <Distribution survey={survey} nodes={nodes} groups={groups} editable={editable} onPatch={(p) => updateSurvey.mutate(p)} />

      {survey.isOwner && <Editors surveyId={id} collaborators={data.collaborators} />}

      {/* Questions grouped by section, then the ungrouped ones. */}
      {data.sections.map((sec) => (
        <SectionCard key={sec.id} surveyId={id} section={sec} questions={questions.filter((q) => q.sectionId === sec.id)} editable={editable} addQuestion={(t) => addQ.mutate({ type: t, prompt: "New question", options: isChoice(t) ? ["Option 1", "Option 2"] : undefined, sectionId: sec.id })} />
      ))}

      <div className="mt-3 space-y-3">
        {questions.filter((q) => !q.sectionId).map((q, i, arr) => (
          <QuestionEditor key={q.id} surveyId={id} q={q} editable={editable} first={i === 0} last={i === arr.length - 1} />
        ))}
      </div>

      {editable && (
        <Card className="mt-4 flex flex-wrap items-center gap-2">
          <select value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <Button onClick={() => addQ.mutate({ type: newType, prompt: "New question", options: isChoice(newType) ? ["Option 1", "Option 2"] : undefined })} disabled={addQ.isPending}>+ Add question</Button>
          <AddSection surveyId={id} />
        </Card>
      )}

      <History surveyId={id} />
    </div>
  );
}

function AddSection({ surveyId }: { surveyId: string }) {
  const add = useAddSection(surveyId);
  return <Button variant="ghost" onClick={() => add.mutate({ title: "New section" })} disabled={add.isPending}>+ Add section</Button>;
}

function SectionCard({ surveyId, section, questions, editable, addQuestion }: { surveyId: string; section: SurveySection; questions: SQuestion[]; editable: boolean; addQuestion: (type: string) => void }) {
  const update = useUpdateSection(surveyId);
  const del = useDeleteSection(surveyId);
  const [type, setType] = useState("SINGLE");
  return (
    <Card className="mt-3 border-l-4 border-l-primary/40">
      <div className="mb-2 flex items-center gap-2">
        <input defaultValue={section.title} disabled={!editable} onBlur={(e) => e.target.value.trim() && e.target.value !== section.title && update.mutate({ sid: section.id, title: e.target.value.trim() })} className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm font-semibold" />
        {editable && (
          <>
            <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={section.showToTakers} onChange={(e) => update.mutate({ sid: section.id, showToTakers: e.target.checked })} /> Show to takers</label>
            <button onClick={() => del.mutate(section.id)} className="text-muted hover:text-red-600" title="Delete section (keeps its questions)">×</button>
          </>
        )}
      </div>
      <div className="space-y-3">
        {questions.map((q, i, arr) => <QuestionEditor key={q.id} surveyId={surveyId} q={q} editable={editable} first={i === 0} last={i === arr.length - 1} />)}
        {questions.length === 0 && <p className="text-xs text-muted">No questions in this section yet.</p>}
      </div>
      {editable && (
        <div className="mt-2 flex items-center gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <button onClick={() => addQuestion(type)} className="text-xs text-primary hover:underline">+ add to section</button>
        </div>
      )}
    </Card>
  );
}

function Editors({ surveyId, collaborators }: { surveyId: string; collaborators: { id: string; name: string }[] }) {
  const add = useAddCollaborator(surveyId);
  const remove = useRemoveCollaborator(surveyId);
  const [email, setEmail] = useState("");
  return (
    <Card className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-muted">Editors</h3>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {collaborators.length === 0 && <span className="text-sm text-muted">Just you so far.</span>}
        {collaborators.map((c) => (
          <span key={c.id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{c.name}<button onClick={() => remove.mutate(c.id)} className="hover:text-red-600">×</button></span>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(email.trim(), { onSuccess: () => setEmail("") }); }} className="flex items-center gap-2">
        <Input type="email" placeholder="Add an editor by email…" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
        <Button type="submit" variant="ghost" disabled={add.isPending || !email.trim()}>Add</Button>
      </form>
      {add.isError && <p className="mt-1 text-xs text-red-600">No teammate found with that email.</p>}
    </Card>
  );
}

function History({ surveyId }: { surveyId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useSurveyEdits(surveyId, open);
  return (
    <Card className="mt-6">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-muted hover:text-fg">Revision history {open ? "▾" : "▸"}</button>
      {open && (
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.edits ?? []).length === 0 && <li className="text-muted">No edits recorded yet.</li>}
          {(data?.edits ?? []).map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3">
              <span><span className="font-medium">{e.actorName}</span> {e.action}{e.detail ? <span className="text-muted"> “{e.detail}”</span> : ""}</span>
              <span className="shrink-0 text-xs text-muted">{new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Distribution({ survey, nodes, groups, editable, onPatch }: { survey: SurveyDetail["survey"]; nodes: OrgNode[]; groups: Group[]; editable: boolean; onPatch: (p: Record<string, unknown>) => void }) {
  const nameOf = (ref: ScopeRef) => (ref.kind === "NODE" ? nodes.find((n) => n.id === ref.id)?.name : groups.find((g) => g.id === ref.id)?.name) ?? "—";
  const scopeValue = survey.scopeKind === "ALL" ? "ALL" : survey.scopeKind ? `${survey.scopeKind}:${survey.scopeId}` : "";
  const setScope = (v: string) => {
    if (v === "ALL") onPatch({ scopeKind: "ALL", scopeId: null });
    else { const [kind, id] = v.split(":"); onPatch({ scopeKind: kind, scopeId: id }); }
  };
  const addExclusion = (v: string) => {
    const [kind, id] = v.split(":");
    if (!kind || !id || survey.exclusions.some((e) => e.id === id)) return;
    onPatch({ exclusions: [...survey.exclusions, { kind, id }] });
  };

  if (!editable) {
    return (
      <Card className="mb-6">
        <h3 className="mb-1 text-sm font-semibold text-muted">Distribution</h3>
        <p className="text-sm">{survey.scopeLabel ?? "—"}{survey.exclusions.length > 0 && <span className="text-muted"> · except {survey.exclusions.map(nameOf).join(", ")}</span>}</p>
      </Card>
    );
  }
  return (
    <Card className="mb-6 space-y-3">
      <h3 className="text-sm font-semibold text-muted">Distribution</h3>
      <label className="flex items-center gap-2 text-sm">
        Send to
        <select value={scopeValue} onChange={(e) => e.target.value && setScope(e.target.value)} className="rounded border border-border bg-surface px-2 py-1">
          <option value="">Choose…</option>
          <option value="ALL">Org-wide</option>
          {nodes.length > 0 && <optgroup label="Department / team">{nodes.map((n) => <option key={n.id} value={`NODE:${n.id}`}>{"  ".repeat(n.path.split(".").length - 1)}{n.name}</option>)}</optgroup>}
          {groups.length > 0 && <optgroup label="Group">{groups.map((g) => <option key={g.id} value={`GROUP:${g.id}`}>{g.name}</option>)}</optgroup>}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Except</span>
        {survey.exclusions.map((ex) => (
          <span key={ex.id} className="flex items-center gap-1 rounded-full bg-border/60 px-2 py-0.5 text-xs">
            {nameOf(ex)}
            <button onClick={() => onPatch({ exclusions: survey.exclusions.filter((e) => e.id !== ex.id) })} className="hover:text-red-600">×</button>
          </span>
        ))}
        <select value="" onChange={(e) => e.target.value && addExclusion(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5 text-xs">
          <option value="">+ exclude…</option>
          {nodes.map((n) => <option key={n.id} value={`NODE:${n.id}`}>{n.name}</option>)}
          {groups.map((g) => <option key={g.id} value={`GROUP:${g.id}`}>{g.name}</option>)}
        </select>
      </div>
    </Card>
  );
}

function QuestionEditor({ surveyId, q, editable, first, last }: { surveyId: string; q: SQuestion; editable: boolean; first: boolean; last: boolean }) {
  const update = useUpdateQuestion(surveyId);
  const del = useDeleteQuestion(surveyId);
  const move = useMoveQuestion(surveyId);
  const choice = isChoice(q.type);

  return (
    <Card>
      <div className="flex items-start gap-2">
        <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{TYPES.find((t) => t.v === q.type)?.label ?? q.type}</span>
        <input
          defaultValue={q.prompt}
          disabled={!editable}
          onBlur={(e) => e.target.value.trim() && e.target.value !== q.prompt && update.mutate({ qid: q.id, prompt: e.target.value.trim() })}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm font-medium"
        />
        {editable && (
          <span className="flex shrink-0 items-center gap-1 text-muted">
            <button onClick={() => move.mutate({ qid: q.id, dir: "up" })} disabled={first} className="px-1 hover:text-fg disabled:opacity-30">↑</button>
            <button onClick={() => move.mutate({ qid: q.id, dir: "down" })} disabled={last} className="px-1 hover:text-fg disabled:opacity-30">↓</button>
            <button onClick={() => del.mutate(q.id)} className="px-1 hover:text-red-600">×</button>
          </span>
        )}
      </div>

      {choice && (
        <div className="mt-2 space-y-1 pl-1">
          {q.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-xs text-muted">{q.type === "SINGLE" ? "○" : "☐"}</span>
              <input
                defaultValue={opt}
                disabled={!editable}
                onBlur={(e) => { const v = q.options.map((o, j) => (j === i ? e.target.value : o)); if (e.target.value !== opt) update.mutate({ qid: q.id, options: v }); }}
                className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-0.5 text-sm"
              />
              {editable && q.options.length > 1 && <button onClick={() => update.mutate({ qid: q.id, options: q.options.filter((_, j) => j !== i) })} className="text-muted hover:text-red-600">×</button>}
            </div>
          ))}
          {editable && <button onClick={() => update.mutate({ qid: q.id, options: [...q.options, `Option ${q.options.length + 1}`] })} className="pl-4 text-xs text-primary hover:underline">+ add option</button>}
        </div>
      )}

      {editable && (
        <div className="mt-2 flex flex-wrap gap-4 pl-1 text-xs text-muted">
          <label className="flex items-center gap-1"><input type="checkbox" checked={q.required} onChange={(e) => update.mutate({ qid: q.id, required: e.target.checked })} /> Required</label>
          {choice && <label className="flex items-center gap-1"><input type="checkbox" checked={q.allowOther} onChange={(e) => update.mutate({ qid: q.id, allowOther: e.target.checked })} /> Allow "Other"</label>}
        </div>
      )}
    </Card>
  );
}
