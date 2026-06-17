import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Idea } from "../../lib/sessions";
import { useAddBoardComment, useAddBoardIdea, useBoard, useBoardIdeaComments, useLikeBoardIdea } from "../../lib/boards";
import { NoticeBoard } from "./notice";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

type Sort = "new" | "liked" | "hot";

export function BoardDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useBoard(id);
  const add = useAddBoardIdea(id);
  const [sort, setSort] = useState<Sort>("liked");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!data) return <div className="max-w-2xl space-y-3"><p className="text-sm text-muted">Board not found.</p><Button onClick={() => navigate("/boards")}>Back to boards</Button></div>;

  const header = (
    <>
      <PageHeader title={data.board.title} subtitle={`${data.board.type === "NOTICE" ? "Notice board" : "Brainstorm"} · ${data.board.scope}`} />
      {data.board.description && <p className="mb-4 -mt-2 text-sm text-muted">{data.board.description}</p>}
    </>
  );

  if (data.board.type === "NOTICE") {
    return <div className="max-w-2xl">{header}<NoticeBoard boardId={id} posts={data.posts ?? []} /></div>;
  }

  const ideas = [...(data.ideas ?? [])].sort((a, b) => (sort === "liked" ? b.likes - a.likes : sort === "hot" ? b.comments - a.comments : b.createdAt.localeCompare(a.createdAt)));

  return (
    <div className="max-w-2xl">
      {header}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          {!adding ? (
            <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-base leading-none">+</span> Add idea
            </button>
          ) : <span />}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">
            <option value="liked">Most liked</option>
            <option value="new">Newest</option>
            <option value="hot">Hot (comments)</option>
          </select>
        </div>

        {adding && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate({ title: title.trim(), body: body.trim() || undefined }, { onSuccess: () => { setTitle(""); setBody(""); setAdding(false); } }); }}
            className="mb-4 space-y-2 rounded-lg border border-border p-3"
          >
            <Input placeholder="Your idea" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <Input placeholder="Explanation (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" disabled={!title.trim() || add.isPending}>Add</Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {ideas.length === 0 && <p className="text-sm text-muted">No ideas yet — add the first one.</p>}
          {ideas.map((idea) => <BoardIdea key={idea.id} boardId={id} idea={idea} />)}
        </div>
      </Card>
    </div>
  );
}

function BoardIdea({ boardId, idea }: { boardId: string; idea: Idea }) {
  const like = useLikeBoardIdea(boardId);
  const [open, setOpen] = useState(false);
  const { data } = useBoardIdeaComments(boardId, idea.id, open);
  const addComment = useAddBoardComment(boardId, idea.id);
  const [text, setText] = useState("");
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{idea.title}</div>
          {idea.body && <div className="text-sm text-muted">{idea.body}</div>}
          <div className="mt-0.5 text-xs text-muted">by {idea.authorName}</div>
        </div>
        <button onClick={() => like.mutate(idea.id)} className={`shrink-0 text-sm ${idea.likedByMe ? "text-primary" : "text-muted"} hover:text-primary`}>♥ {idea.likes}</button>
      </div>
      <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-muted hover:text-fg">💬 {idea.comments} comment{idea.comments === 1 ? "" : "s"}</button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-border pt-2">
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
