import { useState } from "react";
import { type MyTask, dueClass, dueLabel, useAddMyTask, useDeleteMyTask, useMyTasks, useTaskPeople, useUpdateMyTask } from "../../lib/tasks";
import { UnitView } from "./unit-view";
import { TaskFeed } from "./feed";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const COLUMNS = [
  { key: "TODO", label: "To do" },
  { key: "DOING", label: "In progress" },
  { key: "DONE", label: "Done" },
];

export function TasksPage() {
  const { data, isLoading } = useMyTasks();
  const { data: peopleData } = useTaskPeople();
  const update = useUpdateMyTask();
  const del = useDeleteMyTask();
  const add = useAddMyTask();
  const [view, setView] = useState<"board" | "unit">("board");
  const [feedOpen, setFeedOpen] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [onlyPerson, setOnlyPerson] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [parent, setParent] = useState("");

  const people = peopleData?.people ?? [];
  const all = data?.tasks ?? [];
  let tasks = mineOnly ? all.filter((t) => t.assignedToMe) : all;
  if (onlyPerson) tasks = tasks.filter((t) => t.assignee?.id === onlyPerson.id);
  const parents = all.filter((t) => !t.parentId); // only top-level tasks can be parents (one level)

  function submit() {
    const t = title.trim();
    if (!t) return;
    add.mutate({ title: t, assigneeId: assignee || null, dueDate: due || null, parentId: parent || null }, { onSuccess: () => { setTitle(""); setAssignee(""); setDue(""); setParent(""); } });
  }

  const viewBtn = (key: typeof view, label: string) => (
    <button onClick={() => setView(key)} className={cn("rounded-md px-2 py-1 text-xs font-medium", view === key ? "bg-primary/10 text-primary" : "text-muted hover:text-fg")}>{label}</button>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-2">
        <PageHeader title="To-do" subtitle="Your team's to-dos — add them here or capture them in a session." />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-bg p-0.5">
            {viewBtn("board", "Board")}
            {viewBtn("unit", "By unit")}
          </div>
          <button onClick={() => setFeedOpen((o) => !o)} className="text-xs font-medium text-muted hover:text-fg">Recent {feedOpen ? "▾" : "▸"}</button>
          <label className="flex items-center gap-1 text-sm text-muted">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Assigned to me
          </label>
        </div>
      </div>

      {feedOpen && (
        <Card className="mb-4">
          <div className="mb-2 text-xs font-semibold text-muted">Recent activity</div>
          <TaskFeed limit={30} />
        </Card>
      )}

      {onlyPerson && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Showing {onlyPerson.name}</span>
          <button onClick={() => setOnlyPerson(null)} className="text-xs text-muted hover:underline">clear</button>
        </div>
      )}

      {/* Add a task directly to the board */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="min-w-48 flex-1" />
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <select value={parent} onChange={(e) => setParent(e.target.value)} className="max-w-44 rounded-lg border border-border bg-surface px-3 py-2 text-sm" title="Make this a subtask of…">
            <option value="">No parent</option>
            {parents.map((p) => <option key={p.id} value={p.id}>↳ {p.key} {p.title}</option>)}
          </select>
          <Button onClick={submit} disabled={!title.trim() || add.isPending}>Add task</Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : all.length === 0 ? (
        <Card><p className="text-sm text-muted">No to-dos yet. Add one above, or capture them in a session.</p></Card>
      ) : view === "unit" ? (
        <UnitView tasks={tasks} people={people} onShowPerson={(id, name) => setOnlyPerson({ id, name })} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="rounded-lg bg-bg p-2">
                <div className="mb-2 px-1 text-xs font-semibold text-muted">{col.label} ({items.length})</div>
                <div className="space-y-2">
                  {items.map((t) => <TaskCard key={t.id} task={t} people={people} onUpdate={(v) => update.mutate({ taskId: t.id, ...v })} onDelete={() => del.mutate(t.id)} />)}
                  {items.length === 0 && <div className="px-1 py-2 text-xs text-muted">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, people, onUpdate, onDelete }: { task: MyTask; people: { id: string; name: string }[]; onUpdate: (v: { status?: string; assigneeId?: string | null; title?: string }) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  return (
    <div className="rounded-lg border border-border bg-surface p-2 text-sm">
      <div className="flex items-start justify-between gap-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); if (draft.trim() && draft.trim() !== task.title) onUpdate({ title: draft.trim() }); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(task.title); setEditing(false); } }}
            className="min-w-0 flex-1 rounded border border-border bg-bg px-1 py-0.5 text-sm"
          />
        ) : (
          <div className={cn("min-w-0 flex-1 font-medium", task.status === "DONE" && "text-muted line-through")} onDoubleClick={() => { setDraft(task.title); setEditing(true); }} title="Double-click to rename">{task.title}</div>
        )}
        <button onClick={onDelete} className="shrink-0 text-muted hover:text-red-600" title="Delete task">×</button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{task.key}</span>
        {task.parentKey && <span className="rounded bg-border/60 px-1.5 py-0.5">↳ {task.parentKey}</span>}
        {task.subtaskCount > 0 && <span>· {task.subtaskCount} subtask{task.subtaskCount === 1 ? "" : "s"}</span>}
        {task.dueDate && <span className={dueClass(task.dueDate)}>📅 {dueLabel(task.dueDate)}</span>}
        {task.sessionTitle && <span>· from {task.sessionTitle}</span>}
      </div>
      <div className="mt-2 flex gap-1">
        <select
          value={task.assignee?.id ?? ""}
          onChange={(e) => onUpdate({ assigneeId: e.target.value || null })}
          className="min-w-0 flex-1 rounded border border-border bg-bg px-1 py-0.5 text-xs"
          title="Assignee"
        >
          <option value="">Unassigned</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={task.status}
          onChange={(e) => onUpdate({ status: e.target.value })}
          className="rounded border border-border bg-bg px-1 py-0.5 text-xs"
          title="Status"
        >
          {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
    </div>
  );
}
