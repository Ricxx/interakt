import { useState } from "react";
import { type NoticePost, useAddNoticeComment, useNoticeComments, usePinNotice, usePostNotice } from "../../lib/boards";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";

export function NoticeBoard({ boardId, canPin, posts }: { boardId: string; canPin: boolean; posts: NoticePost[] }) {
  const post = usePostNotice(boardId);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [until, setUntil] = useState("");

  const pinned = posts.filter((p) => p.pinned);
  const active = posts.filter((p) => !p.pinned && !p.archived);
  const archived = posts.filter((p) => !p.pinned && p.archived);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    post.mutate(
      { title: title.trim(), body: body.trim() || undefined, activeUntil: until ? new Date(until).toISOString() : undefined },
      { onSuccess: () => { setTitle(""); setBody(""); setUntil(""); setAdding(false); } },
    );
  }

  return (
    <Card>
      {!adding ? (
        <button onClick={() => setAdding(true)} className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-base leading-none">+</span> Post a notice
        </button>
      ) : (
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-lg border border-border p-3">
          <Input placeholder="Notice title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Input placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-muted">
            Active until (optional)
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="w-auto" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={!title.trim() || post.isPending}>Post</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {pinned.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-xs font-semibold text-muted">📌 Pinned</div>
          {pinned.map((p) => <NoticeCard key={p.id} boardId={boardId} canPin={canPin} post={p} />)}
        </div>
      )}

      <div className="space-y-2">
        {active.length === 0 && pinned.length === 0 && <p className="text-sm text-muted">No active notices.</p>}
        {active.map((p) => <NoticeCard key={p.id} boardId={boardId} canPin={canPin} post={p} />)}
      </div>

      {archived.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-muted">Archived</div>
          <div className="space-y-2 opacity-60">
            {archived.map((p) => <NoticeCard key={p.id} boardId={boardId} canPin={canPin} post={p} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

function NoticeCard({ boardId, canPin, post }: { boardId: string; canPin: boolean; post: NoticePost }) {
  const [open, setOpen] = useState(false);
  const { data } = useNoticeComments(boardId, post.id, open);
  const addComment = useAddNoticeComment(boardId, post.id);
  const pin = usePinNotice(boardId);
  const [text, setText] = useState("");
  return (
    <div className={`rounded-lg border p-3 ${post.pinned ? "border-primary/50 bg-primary/5" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{post.pinned && "📌 "}{post.title}</div>
        {canPin && <button onClick={() => pin.mutate(post.id)} disabled={pin.isPending} className="shrink-0 text-xs text-muted hover:text-primary">{post.pinned ? "Unpin" : "Pin"}</button>}
      </div>
      {post.body && <div className="whitespace-pre-wrap text-sm text-muted">{post.body}</div>}
      <div className="mt-0.5 text-xs text-muted">
        by {post.authorName}
        {post.activeUntil && <> · {post.archived ? "expired" : "active until"} {new Date(post.activeUntil).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>}
      </div>
      <button onClick={() => setOpen(!open)} className="mt-1 text-xs text-muted hover:text-fg">💬 {post.comments} comment{post.comments === 1 ? "" : "s"}</button>
      {open && (
        <div className="mt-1 space-y-1 border-t border-border pt-1">
          {data?.comments.map((c) => (
            <div key={c.id} className="text-sm"><span className="font-medium">{c.name}</span> <span className="text-muted">{c.body}</span></div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) addComment.mutate(text.trim(), { onSuccess: () => setText("") }); }} className="flex gap-2 pt-1">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment…" className="flex-1" />
            <Button type="submit" disabled={!text.trim()}>Post</Button>
          </form>
        </div>
      )}
    </div>
  );
}
