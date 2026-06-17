import { useState } from "react";
import { type RepoItem, REPO_CATEGORIES, categoryLabel, useAddRepoComment, useEditRepoItem, useRepoComments } from "../../lib/repo";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

function fmt(d: string | null, withYear = false): string {
  if (!d) return "";
  return new Date(d.length <= 10 ? d + "T00:00" : d).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

export function ItemRow({ item }: { item: RepoItem }) {
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  if (editing) return <EditForm item={item} onDone={() => setEditing(false)} />;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">
            {item.kind === "LINK" ? "🔗 " : "📝 "}
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{item.title}</a> : item.title}
          </div>
          {item.body && <div className="text-muted">{item.body}</div>}
          {item.kind === "LINK" && item.url && <div className="truncate text-xs text-muted">{item.url}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{categoryLabel(item.category)}</span>
          {item.status !== "APPROVED" && <span className={item.status === "PENDING" ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700" : "rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600"}>{item.status.toLowerCase()}</span>}
          {item.canEdit && <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">edit</button>}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>{item.nodeName} ({item.nodeType.toLowerCase()})</span>
        <span>· by {item.submitterName}</span>
        {item.itemDate && <span>· 📅 {fmt(item.itemDate, true)}</span>}
        <button onClick={() => setShowComments((s) => !s)} className="hover:text-fg">💬 {item.commentCount}</button>
      </div>
      {showComments && <Comments itemId={item.id} />}
    </div>
  );
}

function Comments({ itemId }: { itemId: string }) {
  const { data } = useRepoComments(itemId, true);
  const add = useAddRepoComment(itemId);
  const [text, setText] = useState("");
  return (
    <div className="mt-2 space-y-1 border-t border-border pt-2">
      {data?.comments.map((c) => (
        <div key={c.id} className="text-xs"><span className="font-medium">{c.name}</span> <span className="text-muted">{c.body}</span> <span className="text-muted">· {fmt(c.createdAt)}</span></div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(text.trim(), { onSuccess: () => setText("") }); }} className="flex gap-2 pt-1">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment…" className="flex-1" />
        <Button type="submit" disabled={!text.trim() || add.isPending}>Post</Button>
      </form>
    </div>
  );
}

function EditForm({ item, onDone }: { item: RepoItem; onDone: () => void }) {
  const edit = useEditRepoItem();
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url ?? "");
  const [body, setBody] = useState(item.body ?? "");
  const [category, setCategory] = useState(item.category);
  const [date, setDate] = useState(item.itemDate ?? "");
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      {item.kind === "LINK" && <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />}
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Description" />
      <div className="flex gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {REPO_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <Button
          onClick={() => edit.mutate({ id: item.id, title: title.trim(), url: item.kind === "LINK" ? url.trim() : undefined, body: body.trim() || null, category, itemDate: date || null }, { onSuccess: onDone })}
          disabled={!title.trim() || edit.isPending}
        >Save</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
