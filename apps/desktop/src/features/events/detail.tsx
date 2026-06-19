import { useState } from "react";
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useUploadToken } from "../../lib/events";
import {
  type Photo, useAddPhoto, useAddPhotoComment, useAttachList, useContribute, useContributions, useDeletePhoto, useDeletePhotoComment, useEvent, usePhotoComments, usePhotos, useToggleGalleryAnon, useTogglePhotoLike,
} from "../../lib/events";
import { useLists } from "../../lib/lists";
import { uploadImage } from "../../lib/upload";
import { useTenantSettings } from "../../lib/tenant";
import { timeAgo } from "../../lib/tasks";
import { KIND_META, fmtWhen } from "./page";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export function EventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: e } = useEvent(id);
  const { data: settings } = useTenantSettings();
  const photos = usePhotos(id);
  const anonToggle = useToggleGalleryAnon(id);

  if (!e) return <div className="p-2 text-sm text-muted">Loading…</div>;
  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate("/events")} className="mb-2 text-sm text-muted hover:underline">← Events</button>
      <PageHeader title={`${KIND_META[e.kind].icon} ${e.title}`} subtitle={`${KIND_META[e.kind].label} · ${e.scope}${e.startAt ? ` · ${fmtWhen(e.startAt, settings?.timezone)}` : ""}`} />

      {e.instructions && <Card className="mb-4"><p className="whitespace-pre-wrap text-sm text-fg">{e.instructions}</p></Card>}
      <ListLink id={id} list={e.list} canManage={e.canManage} />
      {e.kind === "FUND" && <FundPanel id={id} />}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Gallery {photos.data ? `(${photos.data.photos.length})` : ""}</h2>
        {e.canManage && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={!photos.data?.anon} onChange={(ev) => anonToggle.mutate(!ev.target.checked)} />
            show who liked (off = anonymous)
          </label>
        )}
      </div>

      <AddPhoto id={id} />
      {e.canManage && <QrButton eventId={id} />}

      {!photos.data ? (
        <p className="text-sm text-muted">Loading photos…</p>
      ) : photos.data.photos.length === 0 ? (
        <Card><p className="text-sm text-muted">No photos yet — add the first above.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {photos.data.photos.map((p) => <PhotoCard key={p.id} eventId={id} p={p} anon={photos.data!.anon} />)}
        </div>
      )}
    </div>
  );
}

function ListLink({ id, list, canManage }: { id: string; list: { id: string; title: string } | null; canManage: boolean }) {
  const navigate = useNavigate();
  const attach = useAttachList(id);
  const { data } = useLists();
  if (!list && !canManage) return null;
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">📋 List / to-dos:</span>
      {list ? <button onClick={() => navigate(`/lists/${list.id}`)} className="font-medium text-primary hover:underline">{list.title}</button> : <span className="text-muted">none attached</span>}
      {canManage && (
        <select value={list?.id ?? ""} onChange={(e) => attach.mutate(e.target.value || null)} className="ml-auto rounded-lg border border-border bg-surface px-2 py-1 text-xs">
          <option value="">{list ? "Detach" : "Attach a list…"}</option>
          {(data?.lists ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      )}
    </Card>
  );
}

function FundPanel({ id }: { id: string }) {
  const { data } = useContributions(id, true);
  const contribute = useContribute(id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!data) return null;
  const pct = data.goal && data.goal > 0 ? Math.min(100, Math.round((data.total / data.goal) * 100)) : null;
  return (
    <Card className="mb-4">
      <div className="flex items-end justify-between">
        <span className="text-sm text-muted">Raised <span className="text-lg font-semibold text-fg">{data.total}</span>{data.goal != null && <span> of {data.goal}</span>}</span>
        <span className="text-xs text-muted">{data.count} contribution{data.count === 1 ? "" : "s"}{data.mine > 0 ? ` · you: ${data.mine}` : ""}</span>
      </div>
      {pct != null && (
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border/60"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Input className="w-28" type="number" min={1} placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input className="flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button disabled={!amount || Number(amount) < 1 || contribute.isPending} onClick={() => contribute.mutate({ amount: Number(amount), note: note.trim() || undefined }, { onSuccess: () => { setAmount(""); setNote(""); } })}>Contribute</Button>
      </div>
      <p className="mt-1 text-xs text-muted/70">Contributions are recorded and can't be edited or removed (it's a ledger).</p>
      {data.contributions.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
          {data.contributions.map((c, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className="text-fg">{c.name} <span className="font-medium">+{c.amount}</span>{c.note && <span className="text-muted"> · {c.note}</span>}</span>
              <span className="text-xs text-muted">{c.day}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QrButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useUploadToken(eventId, open);
  const [qr, setQr] = useState("");
  useEffect(() => { if (data?.url) QRCode.toDataURL(data.url, { width: 220 }).then(setQr).catch(() => setQr("")); }, [data?.url]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-3 text-xs text-primary hover:underline">📱 Phone upload (QR)</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-xs space-y-2 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-fg">Scan to add photos</h3>
            <p className="text-xs text-muted">On a phone on the same network, scan this to upload to the gallery — no app or login. Link expires in 2 hours.</p>
            {qr ? <img src={qr} alt="Upload QR" className="mx-auto" /> : <p className="text-sm text-muted">Generating…</p>}
            {data?.url && <p className="break-all text-[10px] text-muted/70">{data.url}</p>}
            <button onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">Close</button>
          </Card>
        </div>
      )}
    </>
  );
}

function AddPhoto({ id }: { id: string }) {
  const add = useAddPhoto(id);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      <Input className="flex-1" placeholder="Image URL, or upload →" value={url} onChange={(e) => setUrl(e.target.value)} />
      <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-border/40">
        {uploading ? "…" : "Upload"}
        <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { setUrl((await uploadImage(f)).url); } finally { setUploading(false); } }} />
      </label>
      <Input className="flex-1" placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <Button disabled={!url.trim() || add.isPending} onClick={() => add.mutate({ url: url.trim(), caption: caption.trim() || undefined }, { onSuccess: () => { setUrl(""); setCaption(""); } })}>Add photo</Button>
    </div>
  );
}

function PhotoCard({ eventId, p, anon }: { eventId: string; p: Photo; anon: boolean }) {
  const like = useTogglePhotoLike(eventId);
  const del = useDeletePhoto(eventId);
  const [showComments, setShowComments] = useState(false);
  return (
    <Card className="overflow-hidden p-0">
      <div className="relative bg-black/5">
        <img src={p.url} alt={p.caption ?? `Photo ${p.number}`} className="max-h-72 w-full object-contain" />
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">#{p.number}</span>
      </div>
      <div className="p-3">
        {p.caption && <p className="text-sm text-fg">{p.caption}</p>}
        <p className="text-xs text-muted">by {p.byName}</p>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button
            onClick={() => like.mutate(p.id)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${p.likedByMe ? "border-rose-300 bg-rose-50 text-rose-600" : "border-border text-muted hover:bg-border/40"}`}
            title={!anon && p.likers.length ? p.likers.join(", ") : "Like"}
          >
            {p.likedByMe ? "♥" : "♡"} {p.likes > 0 && p.likes}
          </button>
          {!anon && p.likers.length > 0 && <span className="text-muted">{p.likers.join(", ")}</span>}
          <button onClick={() => setShowComments((s) => !s)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-muted hover:bg-border/40">💬 {p.comments > 0 ? p.comments : "Comment"}</button>
          {p.canDelete && <button onClick={() => del.mutate(p.id)} className="ml-auto text-muted hover:text-red-600">Remove</button>}
        </div>
        {showComments && <PhotoComments eventId={eventId} photoId={p.id} />}
      </div>
    </Card>
  );
}

function PhotoComments({ eventId, photoId }: { eventId: string; photoId: string }) {
  const { data } = usePhotoComments(photoId, true);
  const add = useAddPhotoComment(eventId);
  const del = useDeletePhotoComment(eventId, photoId);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const all = data?.comments ?? [];
  const top = all.filter((c) => !c.parentId);
  const repliesOf = (pid: string) => all.filter((c) => c.parentId === pid);

  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      {top.map((c) => (
        <div key={c.id} className="text-sm">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-fg">{c.authorName}</span> <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
              <p className="whitespace-pre-wrap text-fg">{c.body}</p>
              <button onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(""); }} className="text-xs text-primary hover:underline">reply</button>
            </div>
            {c.canDelete && <button onClick={() => del.mutate(c.id)} className="shrink-0 text-xs text-muted hover:text-red-600">✕</button>}
          </div>
          <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
            {repliesOf(c.id).map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-sm">
                <div className="min-w-0 flex-1"><span className="font-medium text-fg">{r.authorName}</span> <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span><p className="whitespace-pre-wrap text-fg">{r.body}</p></div>
                {r.canDelete && <button onClick={() => del.mutate(r.id)} className="shrink-0 text-xs text-muted hover:text-red-600">✕</button>}
              </div>
            ))}
            {replyTo === c.id && (
              <div className="flex gap-2 pt-1">
                <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && replyText.trim() && add.mutate({ photoId, body: replyText.trim(), parentId: c.id }, { onSuccess: () => { setReplyText(""); setReplyTo(null); } })} placeholder="Reply…" className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && add.mutate({ photoId, body: text.trim() }, { onSuccess: () => setText("") })} placeholder="Add a comment…" className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
      </div>
    </div>
  );
}
