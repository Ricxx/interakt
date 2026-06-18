import { useState } from "react";
import { type ResourceInput, type WellnessResource, useDeleteResource, useSaveResource, useWellnessResources } from "../../lib/wellness";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

// Institution-controlled support surface. Everyone sees the published resources + "get help"
// contacts. Reaching out opens the person's OWN email or WhatsApp off-app, so it's private and
// leaves no trail here. Admins get an inline manager to author the content.
export function SupportResources() {
  const { data } = useWellnessResources();
  const [editing, setEditing] = useState<WellnessResource | "new" | null>(null);
  if (!data) return null;
  const canManage = data.canManage;
  const visible = data.resources;

  return (
    <Card className="mt-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Support &amp; getting help</h2>
        {canManage && editing === null && (
          <button onClick={() => setEditing("new")} className="text-xs text-primary hover:underline">+ Add resource</button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">Reaching out opens your own email or WhatsApp — it's private, off the record, and nothing is logged here.</p>

      {editing !== null && canManage && (
        <ResourceForm resource={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      {visible.length === 0 && editing === null && (
        <p className="text-sm text-muted">{canManage ? "No resources yet — add support contacts and links your team can reach." : "No support resources have been shared yet."}</p>
      )}

      <div className="space-y-2">
        {visible.map((r) => (
          <ResourceRow key={r.id} r={r} canManage={canManage} onEdit={() => setEditing(r)} />
        ))}
      </div>
    </Card>
  );
}

const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
const mailLink = (email: string) => `mailto:${email}?subject=${encodeURIComponent("Wellness — reaching out")}`;

function ResourceRow({ r, canManage, onEdit }: { r: WellnessResource; canManage: boolean; onEdit: () => void }) {
  const del = useDeleteResource();
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            {r.title}
            {canManage && !r.published && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Draft</span>}
          </div>
          {r.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{r.body}</p>}
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2 text-xs">
            <button onClick={onEdit} className="text-primary hover:underline">Edit</button>
            <button onClick={() => confirm("Delete this resource?") && del.mutate(r.id)} className="text-red-600 hover:underline">Delete</button>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.email && <a href={mailLink(r.email)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90">💬 Get help by email</a>}
        {r.whatsapp && <a href={waLink(r.whatsapp)} target="_blank" rel="noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">WhatsApp</a>}
        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-border/40">Learn more ↗</a>}
      </div>
    </div>
  );
}

function ResourceForm({ resource, onClose }: { resource: WellnessResource | null; onClose: () => void }) {
  const save = useSaveResource();
  const [f, setF] = useState<ResourceInput>({
    title: resource?.title ?? "",
    body: resource?.body ?? "",
    url: resource?.url ?? "",
    email: resource?.email ?? "",
    whatsapp: resource?.whatsapp ?? "",
    published: resource?.published ?? false,
  });
  const set = (k: keyof ResourceInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";

  function submit() {
    if (!f.title.trim()) return;
    save.mutate({ id: resource?.id, data: f }, { onSuccess: onClose });
  }

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <input value={f.title} onChange={set("title")} placeholder="Title (e.g. Talk to us — off the record)" className={input} />
      <textarea value={f.body} onChange={set("body")} placeholder="Supportive blurb / your risk-free vent promise (optional)" rows={2} className={input} />
      <div className="grid grid-cols-2 gap-2">
        <input value={f.email} onChange={set("email")} placeholder="Get-help email (optional)" className={input} />
        <input value={f.whatsapp} onChange={set("whatsapp")} placeholder="WhatsApp number, e.g. +27…" className={input} />
      </div>
      <input value={f.url} onChange={set("url")} placeholder="Info link / URL (optional)" className={input} />
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />
        Visible to everyone (published)
      </label>
      <div className="flex gap-2">
        <Button disabled={!f.title.trim() || save.isPending} onClick={submit}>{resource ? "Save" : "Add"}</Button>
        <button onClick={onClose} className="text-sm text-muted hover:underline">Cancel</button>
      </div>
    </div>
  );
}
