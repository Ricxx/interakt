import { useState } from "react";
import { type CurrentActivity, type Idea, useActivityAction, useAddComment, useAddIdea, useEditBrainstorm, useIdeaComments, useLikeIdea } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";

type Sort = "new" | "liked" | "hot";

export function BrainstormView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const ideas = activity.brainstorm?.ideas ?? [];
  const add = useAddIdea(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const editSubject = useEditBrainstorm(sessionId, activity.id);
  const [sort, setSort] = useState<Sort>("new");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState(activity.title);
  const [eDesc, setEDesc] = useState(activity.config?.description ?? "");

  const sorted = [...ideas].sort((a, b) =>
    sort === "liked" ? b.likes - a.likes : sort === "hot" ? b.comments - a.comments : b.createdAt.localeCompare(a.createdAt),
  );
  const canEdit = canControl && ideas.length === 0; // subject/description locked once ideas exist

  return (
    <Card>
      <div className="mb-1 flex items-start justify-between">
        {editing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (eTitle.trim()) editSubject.mutate({ title: eTitle.trim(), description: eDesc.trim() }, { onSuccess: () => setEditing(false) }); }}
            className="flex-1 space-y-2"
          >
            <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Subject" />
            <Input value={eDesc} onChange={(e) => setEDesc(e.target.value)} placeholder="Description" />
            <div className="flex gap-2">
              <Button type="submit" disabled={!eTitle.trim() || editSubject.isPending}>Save</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Brainstorm</div>
            <h2 className="text-lg font-semibold">
              {activity.title}
              {canEdit && <button onClick={() => { setETitle(activity.title); setEDesc(activity.config?.description ?? ""); setEditing(true); }} className="ml-2 text-xs font-normal text-primary hover:underline">edit</button>}
            </h2>
            {activity.config?.description && <p className="mt-0.5 text-sm text-muted">{activity.config.description}</p>}
          </div>
        )}
        {canControl && !editing && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        {!adding ? (
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-base leading-none">+</span> Add idea
          </button>
        ) : <span />}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">
          <option value="new">Newest</option>
          <option value="liked">Most liked</option>
          <option value="hot">Hot (comments)</option>
        </select>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) add.mutate({ title: title.trim(), body: body.trim() || undefined }, { onSuccess: () => { setTitle(""); setBody(""); setAdding(false); } });
          }}
          className="mb-4 space-y-2 rounded-lg border border-border p-3"
        >
          <Input placeholder="Your idea" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Input placeholder="Explanation (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={!title.trim() || add.isPending}>Add</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          {add.isError && <p className="text-sm text-red-600">Couldn't add the idea — try again.</p>}
        </form>
      )}

      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-sm text-muted">No ideas yet — add the first one.</p>}
        {sorted.map((idea) => <IdeaCard key={idea.id} sessionId={sessionId} activityId={activity.id} idea={idea} />)}
      </div>
    </Card>
  );
}

function IdeaCard({ sessionId, activityId, idea }: { sessionId: string; activityId: string; idea: Idea }) {
  const like = useLikeIdea(sessionId, activityId);
  const [open, setOpen] = useState(false);
  const { data } = useIdeaComments(activityId, idea.id, open);
  const addComment = useAddComment(sessionId, activityId, idea.id);
  const [text, setText] = useState("");

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{idea.title}</div>
          {idea.body && <div className="text-sm text-muted">{idea.body}</div>}
          <div className="mt-0.5 text-xs text-muted">by {idea.authorName}</div>
        </div>
        <button onClick={() => like.mutate(idea.id)} className={`shrink-0 text-sm ${idea.likedByMe ? "text-primary" : "text-muted"} hover:text-primary`}>
          ♥ {idea.likes}
        </button>
      </div>
      <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-muted hover:text-fg">💬 {idea.comments} comment{idea.comments === 1 ? "" : "s"}</button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-border pt-2">
          {data?.comments.map((c) => (
            <div key={c.id} className="text-sm"><span className="font-medium">{c.name}</span> <span className="text-muted">{c.body}</span></div>
          ))}
          <form
            onSubmit={(e) => { e.preventDefault(); if (text.trim()) addComment.mutate(text.trim(), { onSuccess: () => setText("") }); }}
            className="flex gap-2 pt-1"
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment…" className="flex-1" />
            <Button type="submit" disabled={!text.trim()}>Post</Button>
          </form>
        </div>
      )}
    </div>
  );
}
