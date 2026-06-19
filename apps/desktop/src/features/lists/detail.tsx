import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAddComment, useAddItem, useItemComments, useList, useToggleClose, useToggleItem, type ListEvent, type ListItem } from "../../lib/lists";
import { AddToCalendar } from "../calendar/add-to-calendar";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { RefText } from "../../lib/ref-text";

const ACTION_LABEL: Record<string, string> = {
  created: "created the list",
  item_added: "added",
  item_checked: "checked",
  item_unchecked: "unchecked",
  closed: "closed the list",
  reopened: "reopened the list",
  commented: "commented on",
};

function logLine(e: ListEvent) {
  if (e.action === "reset") return `List reset for a new ${e.detail ?? ""} period`.trimEnd();
  const verb = ACTION_LABEL[e.action] ?? e.action;
  return `${e.actorName} ${verb}${e.detail && e.action !== "created" ? ` “${e.detail}”` : ""}`;
}

function ItemRow({ item, listId, closed, onToggle, toggling }: { item: ListItem; listId: string; closed: boolean; onToggle: () => void; toggling: boolean }) {
  const [open, setOpen] = useState(false);
  const { data } = useItemComments(item.id, open);
  const add = useAddComment(item.id, listId);
  const [text, setText] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    add.mutate(text.trim(), { onSuccess: () => setText("") });
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={item.done} disabled={closed || toggling} onChange={onToggle} className="h-4 w-4" />
        <span className={item.done ? "text-muted line-through" : ""}>{item.text}</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-xs text-muted hover:text-primary">
          {item.comments > 0 ? `${item.comments} 💬` : "Comment"}
        </button>
      </div>
      {open && (
        <div className="ml-7 mt-2 space-y-2">
          {(data?.comments ?? []).map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-medium">{c.name}</span> <span className="text-muted"><RefText text={c.body} /></span>
            </div>
          ))}
          <form onSubmit={submit} className="flex items-center gap-2">
            <Input placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={add.isPending || !text.trim()}>Send</Button>
          </form>
        </div>
      )}
    </li>
  );
}

export function ListDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useList(id);
  const addItem = useAddItem(id);
  const toggleItem = useToggleItem(id);
  const toggleClose = useToggleClose(id);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  if (isLoading) return <p className="p-4 text-sm text-muted">Loading…</p>;
  if (!data) return <p className="p-4 text-sm text-muted">List not found.</p>;

  const { list, items, log } = data;
  const closed = list.status === "CLOSED";

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    addItem.mutate(text.trim(), { onSuccess: () => setText("") });
  }

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate("/lists")} className="mb-3 text-sm text-primary hover:underline">← All lists</button>
      <div className="flex items-start justify-between">
        <PageHeader title={list.title} subtitle={`${list.scope} · ${items.filter((i) => i.done).length}/${items.length} done${list.recurrence !== "NONE" ? ` · ${list.recurrence.toLowerCase()}` : ""}${closed ? " · closed" : ""}`} />
        <div className="flex shrink-0 items-center gap-2">
          <AddToCalendar defaultTitle={list.title} listId={list.id} />
          <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/lists/${list.id}`); setCopied(true); }} title="Copy a link to paste into chat or a comment">
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="ghost" onClick={() => toggleClose.mutate(undefined)} disabled={toggleClose.isPending}>
            {closed ? "Reopen" : "Close"}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        {items.length === 0 && <p className="mb-3 text-sm text-muted">No items yet.</p>}
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} listId={list.id} closed={closed} toggling={toggleItem.isPending} onToggle={() => toggleItem.mutate(i.id)} />
          ))}
        </ul>
        {!closed && (
          <form onSubmit={add} className="mt-3 flex items-center gap-2">
            <Input placeholder="Add an item…" value={text} onChange={(e) => setText(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={addItem.isPending || !text.trim()}>Add</Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Activity</h2>
        {log.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
        <ul className="space-y-1.5">
          {log.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{logLine(e)}</span>
              <span className="shrink-0 text-xs text-muted">{new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
