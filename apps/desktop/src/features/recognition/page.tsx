import { useEffect, useState } from "react";
import { useMe } from "../../lib/auth";
import { useTaskPeople, timeAgo } from "../../lib/tasks";
import {
  type GiveInput, type Recognition, BADGES, badgeOf,
  useAddComment, useDeleteComment, useDeleteRecognition, useGiveRecognition, useGroupsList, useMarkRecognitionRead, useOrgNodes, useRecognitionBoard, useRecognitionComments, useRecognitionRecipients, useRecognitionWall, useToggleLike,
} from "../../lib/recognition";
import { useOpenProfile } from "../profile/overlay";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

type RecipType = "USER" | "NODE" | "GROUP";

export function RecognitionPage() {
  const [tab, setTab] = useState<"recent" | "past">("recent");
  const wall = useRecognitionWall(tab);
  const markRead = useMarkRecognitionRead();
  // Opening the page clears the "you were recognised" badge.
  useEffect(() => { markRead.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-3xl">
      <PageHeader title="Recognition" subtitle="Celebrate a teammate, a team, or a whole department." />
      <GiveForm />
      <Leaderboard />

      <div className="mb-2 mt-6 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted">Big-ups & awards</h2>
        <div className="ml-auto flex rounded-lg border border-border p-0.5 text-xs">
          {(["recent", "past"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 capitalize ${tab === t ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>{t}</button>
          ))}
        </div>
      </div>
      {!wall.data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : wall.data.items.length === 0 ? (
        <Card><p className="text-sm text-muted">{tab === "recent" ? "No big-ups yet — be the first to recognise someone above." : "Nothing older than 30 days."}</p></Card>
      ) : (
        <div className="space-y-2">{wall.data.items.map((r) => <RecognitionCard key={r.id} r={r} canAnon={wall.data!.canAnon} />)}</div>
      )}
    </div>
  );
}

function GiveForm() {
  const { data: me } = useMe();
  const people = useTaskPeople();
  const nodes = useOrgNodes();
  const groups = useGroupsList();
  const give = useGiveRecognition();
  const [type, setType] = useState<RecipType>("USER");
  const [recipientId, setRecipientId] = useState("");
  const [badge, setBadge] = useState(BADGES[0].key as string);
  const [message, setMessage] = useState("");
  const [official, setOfficial] = useState(false);
  const [orgWide, setOrgWide] = useState(false);
  const [err, setErr] = useState("");

  const candidates =
    type === "USER" ? (people.data?.people ?? []).filter((p) => p.id !== me?.id).map((p) => ({ id: p.id, name: p.name }))
    : type === "NODE" ? (nodes.data?.nodes ?? []).filter((n) => n.nodeType !== "ORG").map((n) => ({ id: n.id, name: n.name }))
    : (groups.data?.groups ?? []).map((g) => ({ id: g.id, name: g.name }));

  function pickType(t: RecipType) { setType(t); setRecipientId(""); if (t !== "USER") setOfficial(true); }

  function submit() {
    if (!recipientId || !message.trim()) return;
    setErr("");
    const v: GiveInput = { recipientType: type, recipientId, badge, message: message.trim() };
    if (official || type !== "USER") v.kind = "AWARD";
    if (orgWide) v.scopeKind = "ALL";
    give.mutate(v, {
      onSuccess: () => { setRecipientId(""); setMessage(""); setOfficial(false); setOrgWide(false); },
      onError: (e: unknown) => setErr((e as { message?: string })?.message === "forbidden" ? "You don't have permission to issue official awards at that reach." : "Couldn't send — please try again."),
    });
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">Give recognition</h2>
      <div className="mb-2 flex rounded-lg border border-border p-0.5 text-xs">
        {([["USER", "Person"], ["NODE", "Department"], ["GROUP", "Team"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => pickType(t)} className={`flex-1 rounded-md px-3 py-1.5 ${type === t ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="">{type === "USER" ? "Who deserves it?" : type === "NODE" ? "Which department?" : "Which team?"}</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={badge} onChange={(e) => setBadge(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {BADGES.map((b) => <option key={b.key} value={b.key}>{b.emoji} {b.label}</option>)}
        </select>
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What did they do? (everyone in scope can see this)" rows={2} maxLength={500} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
        {type === "USER" && (
          <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} /> Official award</label>
        )}
        <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={orgWide} onChange={(e) => setOrgWide(e.target.checked)} /> Org-wide visibility</label>
        <span className="text-xs text-muted/70">{orgWide ? "Everyone can see it" : "Visible to the recipient's department by default"}</span>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <Button className="mt-2" disabled={!recipientId || !message.trim() || give.isPending} onClick={submit}>Send {official || type !== "USER" ? "award" : "big-up"} 🎉</Button>
    </Card>
  );
}

function Leaderboard() {
  const board = useRecognitionBoard();
  if (!board.data || (board.data.people.length === 0 && board.data.departments.length === 0)) return null;
  const { people, departments, windowDays } = board.data;
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-muted">Most celebrated · last {windowDays} days</h2>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          {people.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-5 text-center text-muted">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="text-fg">{p.name}</span>
                {p.dept && <span className="text-xs text-muted">· {p.dept}</span>}
              </span>
              <span className="font-semibold text-primary">{p.count}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">By department</div>
          {departments.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">{departments.map((d, i) => <span key={i} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{d.name} · {d.count}</span>)}</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RecognitionCard({ r, canAnon }: { r: Recognition; canAnon: boolean }) {
  const del = useDeleteRecognition();
  const like = useToggleLike();
  const openProfile = useOpenProfile();
  const [showMembers, setShowMembers] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const members = useRecognitionRecipients(r.id, showMembers && r.isGroupRecipient);
  const b = badgeOf(r.badge);
  const award = r.kind === "AWARD";
  const subtitle = [r.recipientTitle, r.recipientDept].filter(Boolean).join(" · ");
  return (
    <Card className={`flex items-start gap-3 py-3 ${award ? "border-l-4 border-l-amber-400" : ""}`}>
      <div className="text-2xl" title={b.label}>{award ? "🏆" : b.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <button onClick={() => openProfile(r.fromId)} className="font-semibold text-fg hover:underline">{r.fromName}</button>
          <span className="text-muted"> recognised </span>
          {r.isGroupRecipient ? (
            <button onClick={() => setShowMembers((s) => !s)} className="font-semibold text-primary hover:underline">{r.recipientName} 👥</button>
          ) : (
            <button onClick={() => r.recipientUserId && openProfile(r.recipientUserId)} className="font-semibold text-fg hover:underline">{r.recipientName}</button>
          )}
        </div>
        {!r.isGroupRecipient && subtitle && <div className="text-xs text-muted">{subtitle}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${award ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>{award ? "🏆 " : ""}{b.label}</span>
          <span className="rounded-full bg-border/60 px-2 py-0.5 text-[11px] text-muted">{r.scope}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{r.message}</p>
        {showMembers && r.isGroupRecipient && (
          <div className="mt-1 text-xs text-muted">{!members.data ? "Loading members…" : members.data.people.length === 0 ? "No members." : members.data.people.map((p) => p.name).join(", ")}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={() => like.mutate({ id: r.id, anonymous: false })} disabled={like.isPending} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${r.myKudos === "PUBLIC" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border text-muted hover:bg-border/40"}`} title="Give kudos">
            <span className="text-amber-400">{r.myKudos === "PUBLIC" ? "★" : "☆"}</span> Kudos
          </button>
          {canAnon && (
            <button onClick={() => like.mutate({ id: r.id, anonymous: true })} disabled={like.isPending} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${r.myKudos === "ANON" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border text-muted hover:bg-border/40"}`} title="Give kudos anonymously">
            <span className="text-amber-400">{r.myKudos === "ANON" ? "★" : "☆"}</span> 🕶 Anon
          </button>
          )}
          {/* Medal row — one gold star per kudos-giver; hover a star to see who (or "Anonymous"). */}
          {r.kudos.length > 0 && (
            <div className="flex items-center gap-0.5">
              {r.kudos.map((k, i) => <span key={i} title={k.name} className="cursor-default text-base leading-none text-amber-400">★</span>)}
            </div>
          )}
          <button onClick={() => setShowComments((s) => !s)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-border/40">
            💬 {r.commentCount > 0 ? r.commentCount : "Comment"}
          </button>
        </div>
        {showComments && <Comments id={r.id} />}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
        {r.canDelete && <button onClick={() => del.mutate(r.id)} className="text-xs text-muted hover:text-red-600" title="Remove">✕</button>}
      </div>
    </Card>
  );
}

function Comments({ id }: { id: string }) {
  const { data } = useRecognitionComments(id, true);
  const add = useAddComment();
  const del = useDeleteComment();
  const [text, setText] = useState("");
  const post = () => text.trim() && add.mutate({ id, body: text.trim() }, { onSuccess: () => setText("") });
  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      {data?.comments.map((c) => (
        <div key={c.id} className="flex items-start gap-2 text-sm">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-fg">{c.authorName}</span> <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
            <p className="whitespace-pre-wrap text-fg">{c.body}</p>
          </div>
          {c.canDelete && <button onClick={() => del.mutate({ commentId: c.id, recognitionId: id })} className="shrink-0 text-xs text-muted hover:text-red-600">✕</button>}
        </div>
      ))}
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()} placeholder="Add a comment…" maxLength={500} className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
        <button onClick={post} disabled={!text.trim() || add.isPending} className="text-xs text-primary hover:underline disabled:opacity-50">Post</button>
      </div>
    </div>
  );
}
