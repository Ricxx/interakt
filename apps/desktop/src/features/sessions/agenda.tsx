import { useState } from "react";
import { type AgendaItem, useAddAgendaItem, useAgendaItemAction, useUpdateAgendaItem } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const dur = (m: number | null) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`) : "");

export function Agenda({ sessionId, canControl, items }: { sessionId: string; canControl: boolean; items: AgendaItem[] }) {
  const add = useAddAgendaItem(sessionId);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const total = items.reduce((s, it) => s + (it.durationMins ?? 0), 0);

  function submit() {
    if (!title.trim()) return;
    add.mutate({ title: title.trim(), time: time.trim() || null, durationMins: duration ? Number(duration) : null }, { onSuccess: () => { setTitle(""); setTime(""); setDuration(""); } });
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Agenda</h2>
        {total > 0 && <span className="text-xs text-muted">~{dur(total)} total</span>}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{canControl ? "No agenda yet — add the first item." : "No agenda set."}</p>
      ) : (
        <ol className="space-y-1">
          {items.map((it, i) => (
            <Row key={it.id} sessionId={sessionId} canControl={canControl} item={it} index={i} last={i === items.length - 1} />
          ))}
        </ol>
      )}

      {canControl && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex gap-2">
            <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="10:00" className="w-20" />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Agenda item…" className="flex-1" />
            <Input value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} placeholder="min" className="w-16" />
            <Button onClick={submit} disabled={!title.trim() || add.isPending}>Add</Button>
          </div>
          {items.length > 0 && <p className="text-xs text-muted">The active item is what activities you launch get tagged under.</p>}
        </div>
      )}
    </Card>
  );
}

function Row({ sessionId, canControl, item, index, last }: { sessionId: string; canControl: boolean; item: AgendaItem; index: number; last: boolean }) {
  const update = useUpdateAgendaItem(sessionId);
  const action = useAgendaItemAction(sessionId);
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({ title: item.title, time: item.time ?? "", duration: item.durationMins?.toString() ?? "", note: item.note ?? "" });

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
        <div className="flex gap-2">
          <Input value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} placeholder="10:00" className="w-20" />
          <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Title" className="flex-1" />
          <Input value={d.duration} onChange={(e) => setD({ ...d, duration: e.target.value.replace(/\D/g, "") })} placeholder="min" className="w-16" />
        </div>
        <Input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Note (optional)" />
        <div className="flex gap-2">
          <Button onClick={() => d.title.trim() && update.mutate({ itemId: item.id, title: d.title.trim(), time: d.time.trim() || null, durationMins: d.duration ? Number(d.duration) : null, note: d.note.trim() || null }, { onSuccess: () => setEditing(false) })} disabled={!d.title.trim()}>Save</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </li>
    );
  }

  return (
    <li className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm", item.active ? "border-primary/60 bg-primary/5" : "border-border")}>
      {canControl && <input type="checkbox" checked={item.done} onChange={() => update.mutate({ itemId: item.id, done: !item.done })} title="Done" />}
      {item.time ? <span className="w-12 shrink-0 font-mono text-xs text-muted">{item.time}</span> : <span className="w-12 shrink-0 text-xs text-muted">{index + 1}.</span>}
      <span className="min-w-0 flex-1">
        <span className={cn("truncate", item.done && "text-muted line-through")}>{item.title}</span>
        {item.durationMins ? <span className="ml-2 text-xs text-muted">{dur(item.durationMins)}</span> : null}
        {item.active && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">active</span>}
        {item.note && <span className="block text-xs text-muted">{item.note}</span>}
      </span>
      {canControl && (
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <button onClick={() => action.mutate({ itemId: item.id, action: "activate" })} className="text-primary hover:underline">{item.active ? "unfocus" : "focus"}</button>
          <button onClick={() => setEditing(true)} className="text-muted hover:text-fg">edit</button>
          <button onClick={() => action.mutate({ itemId: item.id, action: "move", dir: "up" })} disabled={index === 0} className="text-muted hover:text-fg disabled:opacity-30">↑</button>
          <button onClick={() => action.mutate({ itemId: item.id, action: "move", dir: "down" })} disabled={last} className="text-muted hover:text-fg disabled:opacity-30">↓</button>
          <button onClick={() => action.mutate({ itemId: item.id, action: "delete" })} className="text-muted hover:text-red-600">×</button>
        </span>
      )}
    </li>
  );
}
