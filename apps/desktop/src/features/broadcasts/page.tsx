import { useEffect, useState } from "react";
import { type Broadcast, useBroadcasts, useSendBroadcast, useAckBroadcast, useDeleteBroadcast } from "../../lib/broadcasts";
import { trackView } from "../../lib/stats";
import { useOrgNodes } from "../../lib/recognition";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

// Remember which announcements we've already counted a view for this session (avoid re-firing).
const seenAnnouncements = new Set<string>();

export function BroadcastsPage() {
  const { data } = useBroadcasts();
  // Record a per-announcement view once each — powers "Opened" reach in Statistics.
  useEffect(() => {
    for (const b of data?.items ?? []) {
      if (!seenAnnouncements.has(b.id)) { seenAnnouncements.add(b.id); trackView("announcements", b.id); }
    }
  }, [data]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Announcements" subtitle="Org and department updates from leadership." />
      {data?.canSendOrg && <Compose />}
      <div className="mt-6 space-y-3">
        {data && data.items.length === 0 && <Card><p className="text-sm text-muted">No announcements yet.</p></Card>}
        {data?.items.map((b) => <Item key={b.id} b={b} />)}
      </div>
    </div>
  );
}

function Compose() {
  const send = useSendBroadcast();
  const { data: org } = useOrgNodes();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [requireAck, setRequireAck] = useState(false);
  const [box, setBox] = useState<"ALL" | "NODE">("ALL");
  const [scopeId, setScopeId] = useState("");

  const submit = () => {
    if (title.trim().length < 2 || body.trim().length < 2) return;
    if (box === "NODE" && !scopeId) return;
    send.mutate(
      { scopeKind: box, scopeId: box === "NODE" ? scopeId : undefined, title: title.trim(), body: body.trim(), requireAck },
      { onSuccess: () => { setTitle(""); setBody(""); setRequireAck(false); setOpen(false); } },
    );
  };

  if (!open) return <Button onClick={() => setOpen(true)}>+ New announcement</Button>;
  return (
    <Card className="space-y-3">
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="What do you want everyone to know?" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={box} onChange={(e) => setBox(e.target.value as "ALL" | "NODE")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="ALL">Everyone</option>
          <option value="NODE">A department</option>
        </select>
        {box === "NODE" && (
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Choose…</option>
            {org?.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={requireAck} onChange={(e) => setRequireAck(e.target.checked)} />
          Require acknowledgement
        </label>
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={send.isPending}>Post</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

function Item({ b }: { b: Broadcast }) {
  const ack = useAckBroadcast();
  const del = useDeleteBroadcast();
  const pct = b.stats && b.stats.recipients > 0 ? Math.round((b.stats.acked / b.stats.recipients) * 100) : 0;
  return (
    <Card className={`space-y-2 ${b.requireAck && !b.acked ? "border-amber-300" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{b.title}</span>
        {b.requireAck && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.acked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{b.acked ? "Acknowledged" : "Action needed"}</span>}
        <span className="ml-auto text-xs text-muted">{b.scope} · {new Date(b.createdAt).toLocaleDateString()}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-fg">{b.body}</p>

      {b.requireAck && !b.acked && <Button onClick={() => ack.mutate(b.id)} disabled={ack.isPending}>Acknowledge</Button>}

      {b.canManage && b.stats && (
        <div className="flex items-center gap-2 border-t border-border pt-2 text-xs text-muted">
          <span>{b.stats.acked}/{b.stats.recipients} acknowledged ({pct}%)</span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <button onClick={() => { if (confirm("Delete this announcement?")) del.mutate(b.id); }} className="ml-auto rounded-md px-2 py-1 text-rose-600 hover:bg-rose-50">Delete</button>
        </div>
      )}
    </Card>
  );
}
