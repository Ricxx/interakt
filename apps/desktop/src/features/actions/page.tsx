import { useState } from "react";
import { type ActionItem, type ActionStatus, useActions, useCreateAction, useUpdateAction, useDeleteAction } from "../../lib/actions";
import { useOrgNodes } from "../../lib/recognition";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const STATUS: Record<ActionStatus, { label: string; cls: string }> = {
  COMMITTED: { label: "Committed", cls: "bg-sky-100 text-sky-700" },
  IN_PROGRESS: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  DONE: { label: "Done", cls: "bg-emerald-100 text-emerald-700" },
};

export function ActionsPage() {
  const { data } = useActions();
  return (
    <div className="max-w-3xl">
      <PageHeader title="You said → We did" subtitle="What the team raised, and what we did about it. Closing the loop, in the open." />
      {data?.canCreateOrg && <NewAction />}
      <div className="mt-6 space-y-2">
        {data && data.items.length === 0 && <Card><p className="text-sm text-muted">Nothing logged yet. When feedback turns into action, it'll appear here.</p></Card>}
        {data?.items.map((a) => <Row key={a.id} a={a} />)}
      </div>
    </div>
  );
}

function NewAction() {
  const create = useCreateAction();
  const { data: org } = useOrgNodes();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");
  const [did, setDid] = useState("");
  const [status, setStatus] = useState<ActionStatus>("COMMITTED");
  const [box, setBox] = useState<"ALL" | "NODE">("ALL");
  const [scopeId, setScopeId] = useState("");

  const submit = () => {
    if (said.trim().length < 3 || did.trim().length < 3) return;
    if (box === "NODE" && !scopeId) return;
    create.mutate(
      { scopeKind: box, scopeId: box === "NODE" ? scopeId : undefined, said: said.trim(), did: did.trim(), status },
      { onSuccess: () => { setSaid(""); setDid(""); setOpen(false); } },
    );
  };

  if (!open) return <Button onClick={() => setOpen(true)}>+ Log an action</Button>;
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted">You said</label>
        <Input placeholder="The feedback we heard…" value={said} onChange={(e) => setSaid(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted">We did</label>
        <Input placeholder="What we did about it…" value={did} onChange={(e) => setDid(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as ActionStatus)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {(Object.keys(STATUS) as ActionStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select value={box} onChange={(e) => setBox(e.target.value as "ALL" | "NODE")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="ALL">Org-wide</option>
          <option value="NODE">A department</option>
        </select>
        {box === "NODE" && (
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Choose…</option>
            {org?.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={create.isPending}>Publish</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

function Row({ a }: { a: ActionItem }) {
  const update = useUpdateAction();
  const del = useDeleteAction();
  const st = STATUS[a.status];
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
        <span className="text-xs text-muted">{a.scope}</span>
        <span className="ml-auto text-xs text-muted">{new Date(a.updatedAt).toLocaleDateString()}</span>
      </div>
      <div>
        <p className="text-sm"><span className="font-semibold text-muted">You said:</span> {a.said}</p>
        <p className="mt-1 text-sm"><span className="font-semibold text-primary">We did:</span> {a.did}</p>
      </div>
      {a.canManage && (
        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
          {(Object.keys(STATUS) as ActionStatus[]).filter((s) => s !== a.status).map((s) => (
            <button key={s} onClick={() => update.mutate({ id: a.id, status: s })} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-border/60 hover:text-fg">Mark {STATUS[s].label}</button>
          ))}
          <button onClick={() => { if (confirm("Remove this entry?")) del.mutate(a.id); }} className="ml-auto rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Remove</button>
        </div>
      )}
    </Card>
  );
}
