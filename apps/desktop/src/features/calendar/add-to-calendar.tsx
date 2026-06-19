import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type CreateEvent, useCreateEvent } from "../../lib/events";
import { useOrgNodes, useGroupsList } from "../../lib/recognition";

// Reusable "Add to calendar" — turns a notice/to-do into a planned event (prefilled title; can attach
// the source list). A compact popover so it can sit on any card without a full create page.
export function AddToCalendar({ defaultTitle, listId }: { defaultTitle: string; listId?: string }) {
  const create = useCreateEvent();
  const navigate = useNavigate();
  const nodes = useOrgNodes();
  const groups = useGroupsList();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [when, setWhen] = useState("");
  const [scopeKind, setScopeKind] = useState<"ALL" | "NODE" | "GROUP">("NODE");
  const [scopeId, setScopeId] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!title.trim() || (scopeKind !== "ALL" && !scopeId)) return;
    setErr("");
    const v: CreateEvent = { kind: "PLAN", title: title.trim(), scopeKind, scopeId: scopeKind === "ALL" ? null : scopeId, startAt: when ? new Date(when).toISOString() : null, ...(listId ? { listId } : {}) };
    create.mutate(v, {
      onSuccess: (r) => navigate(`/events/${r.id}`),
      onError: (e: unknown) => setErr((e as { message?: string })?.message === "forbidden" ? "You can't create org-wide events — pick a department or team." : "Couldn't add — try again."),
    });
  }

  if (!open) return <button onClick={() => { setTitle(defaultTitle); setOpen(true); }} className="text-xs text-primary hover:underline">📅 Add to calendar</button>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-fg">Add to calendar</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select value={scopeKind} onChange={(e) => { setScopeKind(e.target.value as "ALL" | "NODE" | "GROUP"); setScopeId(""); }} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
            <option value="NODE">Department</option><option value="GROUP">Team</option><option value="ALL">Org-wide</option>
          </select>
          {scopeKind === "NODE" && <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm"><option value="">Department…</option>{(nodes.data?.nodes ?? []).filter((n) => n.nodeType !== "ORG").map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>}
          {scopeKind === "GROUP" && <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm"><option value="">Team…</option>{(groups.data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
        </div>
        {listId && <p className="text-xs text-muted">The list will be attached to the event.</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={!title.trim() || (scopeKind !== "ALL" && !scopeId) || create.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-50">Create event</button>
          <button onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">Cancel</button>
        </div>
      </div>
    </div>
  );
}
