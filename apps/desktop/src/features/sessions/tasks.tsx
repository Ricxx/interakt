import { useState } from "react";
import { type CurrentActivity, type Task, useActivityAction, useAddTask, useUpdateTask } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

type Joined = { userId: string; name: string };
const COLUMNS = [
  { key: "TODO", label: "To do" },
  { key: "DOING", label: "In progress" },
  { key: "DONE", label: "Done" },
];

function dueLabel(d: string | null): string {
  if (!d) return "";
  return new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TasksView({ sessionId, canControl, activity, joined }: { sessionId: string; canControl: boolean; activity: CurrentActivity; joined: Joined[] }) {
  const tasks = activity.tasks ?? [];
  const add = useAddTask(sessionId, activity.id);
  const update = useUpdateTask(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");

  function submit() {
    const t = title.trim();
    if (!t) return;
    add.mutate(
      { title: t, assigneeId: assignee || null, dueDate: due || null },
      { onSuccess: () => { setTitle(""); setAssignee(""); setDue(""); } },
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">{activity.title}</h2>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {/* Add a task */}
      <div className="mb-4 space-y-2">
        <Input placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <div className="flex gap-2">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {joined.map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <Button onClick={submit} disabled={!title.trim() || add.isPending}>Add</Button>
        </div>
      </div>

      {/* Board: three columns */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-lg bg-bg p-2">
              <div className="mb-2 px-1 text-xs font-semibold text-muted">{col.label} ({items.length})</div>
              <div className="space-y-2">
                {items.map((t) => <TaskCard key={t.id} task={t} joined={joined} onUpdate={(v) => update.mutate({ taskId: t.id, ...v })} />)}
                {items.length === 0 && <div className="px-1 py-2 text-xs text-muted">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TaskCard({ task, joined, onUpdate }: { task: Task; joined: Joined[]; onUpdate: (v: { status?: string; assigneeId?: string | null }) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2 text-sm">
      <div className={cn("font-medium", task.status === "DONE" && "text-muted line-through")}>{task.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {task.dueDate && <span>📅 {dueLabel(task.dueDate)}</span>}
        {task.byName && <span>· by {task.byName}</span>}
      </div>
      <div className="mt-2 flex gap-1">
        <select
          value={task.assignee?.id ?? ""}
          onChange={(e) => onUpdate({ assigneeId: e.target.value || null })}
          className="min-w-0 flex-1 rounded border border-border bg-bg px-1 py-0.5 text-xs"
          title="Assignee"
        >
          <option value="">Unassigned</option>
          {joined.map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
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
