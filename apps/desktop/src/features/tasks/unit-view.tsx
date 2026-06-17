import { useEffect, useRef, useState } from "react";
import { type MyTask, dueClass, dueLabel, useAddMyTask, useDeleteMyTask, useUpdateMyTask } from "../../lib/tasks";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const STATUS = [
  { key: "TODO", label: "To do" },
  { key: "DOING", label: "In progress" },
  { key: "DONE", label: "Done" },
];

type Person = { id: string; name: string };
type PersonGroup = { id: string; name: string; tasks: MyTask[] };
type UnitGroup = { name: string; people: PersonGroup[] };

// Group tasks by unit (their team list), then by the person they're assigned to.
function groupByUnit(tasks: MyTask[]): UnitGroup[] {
  const units = new Map<string, Map<string, PersonGroup>>();
  for (const t of tasks) {
    const unit = t.listName || "My tasks";
    const pid = t.assignee?.id ?? "__none";
    const pname = t.assignee?.name ?? "Unassigned";
    if (!units.has(unit)) units.set(unit, new Map());
    const pm = units.get(unit)!;
    if (!pm.has(pid)) pm.set(pid, { id: pid, name: pname, tasks: [] });
    pm.get(pid)!.tasks.push(t);
  }
  return [...units.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, pm]) => ({
      name,
      people: [...pm.values()].sort((a, b) => (a.id === "__none" ? 1 : b.id === "__none" ? -1 : a.name.localeCompare(b.name))),
    }));
}

export function UnitView({ tasks, people, onShowPerson }: { tasks: MyTask[]; people: Person[]; onShowPerson: (id: string, name: string) => void }) {
  const units = groupByUnit(tasks);
  if (units.length === 0) return <p className="text-sm text-muted">No tasks to show.</p>;
  return (
    <div className="space-y-5">
      {units.map((u) => (
        <div key={u.name}>
          <div className="mb-2 border-b border-border pb-1 text-sm font-semibold">{u.name}</div>
          <div className="space-y-3">
            {u.people.map((p) => (
              <PersonBlock key={p.id} person={p} people={people} onShowPerson={onShowPerson} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonBlock({ person, people, onShowPerson }: { person: PersonGroup; people: Person[]; onShowPerson: (id: string, name: string) => void }) {
  const add = useAddMyTask();
  const [adding, setAdding] = useState(false);
  const real = person.id !== "__none";
  return (
    <div className="pl-1">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted">{person.name}</span>
        <span className="text-xs text-muted">({person.tasks.length})</span>
        <Menu
          items={[
            { label: `Add task for ${person.name}`, onClick: () => setAdding(true) },
            ...(real ? [{ label: `Show only ${person.name}`, onClick: () => onShowPerson(person.id, person.name) }] : []),
          ]}
        />
      </div>
      <div className="space-y-1">
        {person.tasks.map((t) => <TaskRow key={t.id} task={t} people={people} />)}
      </div>
      {adding && (
        <AddForPerson
          pending={add.isPending}
          onCancel={() => setAdding(false)}
          onAdd={(title) => add.mutate({ title, assigneeId: real ? person.id : null }, { onSuccess: () => setAdding(false) })}
        />
      )}
    </div>
  );
}

function TaskRow({ task, people }: { task: MyTask; people: Person[] }) {
  const update = useUpdateMyTask();
  const del = useDeleteMyTask();
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-sm">
      <span className="font-mono text-xs text-primary">{task.key}</span>
      <span className={cn("min-w-0 flex-1 truncate", task.status === "DONE" && "text-muted line-through")}>{task.title}</span>
      {task.parentKey && <span className="rounded bg-border/60 px-1 text-xs text-muted">↳ {task.parentKey}</span>}
      {task.dueDate && <span className={cn("text-xs", dueClass(task.dueDate))}>📅 {dueLabel(task.dueDate)}</span>}
      <select value={task.status} onChange={(e) => update.mutate({ taskId: task.id, status: e.target.value })} className="rounded border border-border bg-bg px-1 py-0.5 text-xs" title="Status">
        {STATUS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select value={task.assignee?.id ?? ""} onChange={(e) => update.mutate({ taskId: task.id, assigneeId: e.target.value || null })} className="max-w-28 rounded border border-border bg-bg px-1 py-0.5 text-xs" title="Assignee">
        <option value="">Unassigned</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button onClick={() => del.mutate(task.id)} className="text-muted hover:text-red-600" title="Delete">×</button>
    </div>
  );
}

function AddForPerson({ pending, onAdd, onCancel }: { pending: boolean; onAdd: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <div className="mt-1 flex items-center gap-2">
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onAdd(title.trim()); if (e.key === "Escape") onCancel(); }} placeholder="Task title…" className="flex-1" />
      <Button onClick={() => title.trim() && onAdd(title.trim())} disabled={!title.trim() || pending}>Add</Button>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

// Small "⋯" menu, closes on outside click or after an action.
function Menu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded px-1 leading-none text-muted hover:bg-border/40" title="Actions">⋯</button>
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
          {items.map((it, i) => (
            <button key={i} onClick={() => { it.onClick(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-border/40">{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
