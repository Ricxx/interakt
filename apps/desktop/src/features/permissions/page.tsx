import { useState } from "react";
import { type Capability, type GroupCap, type PermGroup, SCOPE_LABEL, useCapabilities, useCreatePermGroup, useDeletePermGroup, useDuplicateGroup, usePermGroups, useSetGroupCaps, useSetGroupParents, useUpdatePermGroup } from "../../lib/permissions";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export function PermissionsPage() {
  const { data: capData } = useCapabilities();
  const { data, isLoading } = usePermGroups();
  const create = useCreatePermGroup();
  const [name, setName] = useState("");
  const [level, setLevel] = useState("1");
  const caps = capData?.capabilities ?? [];
  const categories = capData?.categories ?? [];
  const scopes = capData?.scopes ?? [];
  const groups = data?.groups ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Permissions" subtitle="Permission groups bundle capabilities by feature. Org structure sets reach; the group sets rights. Assign people on the Members page." />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group (e.g. Staff, Director)" className="min-w-44 flex-1" />
          <label className="flex items-center gap-1 text-sm text-muted">level<Input value={level} onChange={(e) => setLevel(e.target.value.replace(/\D/g, ""))} className="w-14" /></label>
          <Button onClick={() => name.trim() && create.mutate({ name: name.trim(), level: Number(level) || 1 }, { onSuccess: () => { setName(""); setLevel("1"); } })} disabled={!name.trim() || create.isPending}>Create</Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <Card><p className="text-sm text-muted">No permission groups yet. Create one above, then add capabilities.</p></Card>
      ) : (
        <div className="space-y-3">{groups.map((g) => <GroupCard key={g.id} group={g} groups={groups} caps={caps} categories={categories} scopes={scopes} />)}</div>
      )}
    </div>
  );
}

function GroupCard({ group, groups, caps, categories, scopes }: { group: PermGroup; groups: PermGroup[]; caps: Capability[]; categories: string[]; scopes: string[] }) {
  const setCaps = useSetGroupCaps();
  const setParents = useSetGroupParents();
  const update = useUpdatePermGroup();
  const duplicate = useDuplicateGroup();
  const del = useDeletePermGroup();
  const [open, setOpen] = useState(false);

  const current = new Map(group.caps.map((c) => [c.capability, c.scope]));
  const others = groups.filter((g) => g.id !== group.id);

  function toggle(cap: Capability, on: boolean) {
    const next: GroupCap[] = caps.filter((c) => (c.key === cap.key ? on : current.has(c.key))).map((c) => ({ capability: c.key, scope: c.key === cap.key ? (cap.scoped ? "NODE" : null) : current.get(c.key) ?? null }));
    setCaps.mutate({ id: group.id, caps: next });
  }
  function setScope(cap: Capability, scope: string) {
    setCaps.mutate({ id: group.id, caps: group.caps.map((c) => ({ capability: c.capability, scope: c.capability === cap.key ? scope : c.scope })) });
  }
  function toggleParent(pid: string, on: boolean) {
    setParents.mutate({ id: group.id, parentIds: on ? [...group.parentIds, pid] : group.parentIds.filter((x) => x !== pid) });
  }

  const parentNames = group.parentIds.map((pid) => groups.find((g) => g.id === pid)?.name).filter(Boolean);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(!open)} className="text-sm font-semibold hover:text-primary">
          {open ? "▾" : "▸"} {group.name} <span className="ml-1 rounded bg-border/60 px-1.5 py-0.5 text-xs font-normal text-muted">L{group.level}</span>
          <span className="ml-1 text-xs font-normal text-muted">· {group.caps.length} caps{parentNames.length ? ` · inherits ${parentNames.join(", ")}` : ""} · {group.memberCount} members</span>
        </button>
        <span className="flex gap-2 text-xs">
          <button onClick={() => duplicate.mutate(group.id)} className="text-primary hover:underline">duplicate</button>
          <button onClick={() => { if (confirm(`Delete "${group.name}"?`)) del.mutate(group.id); }} className="text-red-600 hover:underline">delete</button>
        </span>
      </div>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-muted">Rename<Input defaultValue={group.name} onBlur={(e) => e.target.value.trim() && e.target.value !== group.name && update.mutate({ id: group.id, name: e.target.value.trim() })} className="h-7 w-40" /></label>
            <label className="flex items-center gap-1 text-muted">Level<Input defaultValue={String(group.level)} onBlur={(e) => Number(e.target.value) && Number(e.target.value) !== group.level && update.mutate({ id: group.id, level: Number(e.target.value) })} className="h-7 w-14" /></label>
          </div>

          {others.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Inherits from</div>
              <div className="flex flex-wrap gap-2">
                {others.map((o) => (
                  <label key={o.id} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={group.parentIds.includes(o.id)} onChange={(e) => toggleParent(o.id, e.target.checked)} />
                    {o.name} (L{o.level})
                  </label>
                ))}
              </div>
            </div>
          )}

          {categories.map((cat) => (
            <div key={cat}>
              <div className="mb-1 text-xs font-semibold text-muted">{cat}</div>
              <ul className="space-y-1">
                {caps.filter((c) => c.category === cat).map((c) => {
                  const on = current.has(c.key);
                  return (
                    <li key={c.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={on} onChange={(e) => toggle(c, e.target.checked)} />
                      <span className="flex-1">{c.label}</span>
                      {c.scoped && on && (
                        <select value={current.get(c.key) ?? "NODE"} onChange={(e) => setScope(c, e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5 text-xs">
                          {scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s] ?? s}</option>)}
                        </select>
                      )}
                      {c.scoped && !on && <span className="text-xs text-muted">scoped</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
