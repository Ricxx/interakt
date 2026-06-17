import { useState } from "react";
import { type CurrentActivity, type ReviewCard, useActivityAction, useAddTask, useReviewDeleteTask, useReviewSetTask, useSetSpotlight } from "../../lib/sessions";
import { useTaskPeople } from "../../lib/tasks";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const STATUS = [
  { key: "TODO", label: "To do" },
  { key: "DOING", label: "In progress" },
  { key: "DONE", label: "Done" },
];

export function TaskReviewView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const review = activity.taskReview!;
  const { data: peopleData } = useTaskPeople();
  const people = peopleData?.people ?? [];
  const spotlight = useSetSpotlight(sessionId, activity.id);
  const setTask = useReviewSetTask(sessionId);
  const delTask = useReviewDeleteTask(sessionId);
  const addTask = useAddTask(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const s = review.spotlight;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Task review</div>
          <div className="text-sm text-muted">Reference a task to focus the room on it.</div>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {/* Reference picker — spotlight any task by key */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={s?.id ?? ""}
          onChange={(e) => spotlight.mutate(e.target.value || null)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">Reference a task…</option>
          {review.board.map((t) => (
            <option key={t.id} value={t.id}>{t.parentId ? "↳ " : ""}{t.key} · {t.title}</option>
          ))}
        </select>
        {s && <Button variant="ghost" onClick={() => spotlight.mutate(null)}>Clear</Button>}
      </div>

      {s ? (
        <div className="space-y-3">
          {/* Spotlight task */}
          <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4" style={{ animation: "ces-pop 0.3s ease-out" }}>
            {s.parentKey && (
              <button onClick={() => s.parentId && spotlight.mutate(s.parentId)} className="mb-1 text-xs text-muted hover:text-primary">↑ part of {s.parentKey}</button>
            )}
            <div className="flex items-start justify-between gap-2">
              <div className={cn("text-lg font-semibold", s.status === "DONE" && "text-muted line-through")}>
                <span className="mr-2 font-mono text-sm text-primary">{s.key}</span>{s.title}
              </div>
              <button onClick={() => { if (confirm(`Remove ${s.key}?`)) delTask.mutate(s.id); }} className="shrink-0 text-muted hover:text-red-600" title="Remove">×</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusSelect value={s.status} onChange={(status) => setTask.mutate({ taskId: s.id, status })} />
              <AssigneeSelect value={s.assignee?.id ?? ""} people={people} onChange={(assigneeId) => setTask.mutate({ taskId: s.id, assigneeId })} />
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div className="mb-1 text-xs font-semibold text-muted">Subtasks ({s.subtasks.length})</div>
            <div className="space-y-1">
              {s.subtasks.map((sub) => (
                <SubtaskRow key={sub.id} sub={sub} people={people} onOpen={() => spotlight.mutate(sub.id)} onUpdate={(v) => setTask.mutate({ taskId: sub.id, ...v })} onDelete={() => delTask.mutate(sub.id)} />
              ))}
              {s.subtasks.length === 0 && <div className="text-xs text-muted">No subtasks yet.</div>}
            </div>
            <AddTaskRow placeholder="Add a subtask…" people={people} pending={addTask.isPending} onAdd={(v) => addTask.mutate({ ...v, parentId: s.id })} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {review.board.length === 0 ? (
            <p className="text-sm text-muted">No tasks on this team's board yet — add the first one.</p>
          ) : (
            <p className="text-sm text-muted">Pick a task above to spotlight it for everyone.</p>
          )}
          <AddTaskRow placeholder="Add a task to the board…" people={people} pending={addTask.isPending} onAdd={(v) => addTask.mutate(v)} />
        </div>
      )}
    </Card>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs" title="Status">
      {STATUS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
    </select>
  );
}

function AssigneeSelect({ value, people, onChange }: { value: string; people: { id: string; name: string }[]; onChange: (v: string | null) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value || null)} className="rounded border border-border bg-surface px-2 py-1 text-xs" title="Assignee">
      <option value="">Unassigned</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function SubtaskRow({ sub, people, onOpen, onUpdate, onDelete }: { sub: ReviewCard; people: { id: string; name: string }[]; onOpen: () => void; onUpdate: (v: { status?: string; assigneeId?: string | null }) => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-sm">
      <button onClick={onOpen} className="min-w-0 flex-1 truncate text-left hover:text-primary" title="Open in spotlight">
        <span className="mr-1 font-mono text-xs text-primary">{sub.key}</span>
        <span className={cn(sub.status === "DONE" && "text-muted line-through")}>{sub.title}</span>
      </button>
      <StatusSelect value={sub.status} onChange={(status) => onUpdate({ status })} />
      <AssigneeSelect value={sub.assignee?.id ?? ""} people={people} onChange={(assigneeId) => onUpdate({ assigneeId })} />
      <button onClick={onDelete} className="text-muted hover:text-red-600" title="Remove">×</button>
    </div>
  );
}

function AddTaskRow({ placeholder, people, pending, onAdd }: { placeholder: string; people: { id: string; name: string }[]; pending: boolean; onAdd: (v: { title: string; assigneeId?: string | null }) => void }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  function go() {
    const t = title.trim();
    if (!t) return;
    onAdd({ title: t, assigneeId: assignee || null });
    setTitle("");
    setAssignee("");
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={placeholder} className="flex-1" />
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
        <option value="">Unassigned</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <Button onClick={go} disabled={!title.trim() || pending}>Add</Button>
    </div>
  );
}
