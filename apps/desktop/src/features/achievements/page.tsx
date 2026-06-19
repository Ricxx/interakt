import { useState } from "react";
import { type AchStatus, type AchievementDef, type DefInput, METRICS, metricLabel, useAchievementDefs, useDeleteAchievement, useMyAchievements, useSaveAchievement } from "../../lib/achievements";
import { useOrgNodes, useGroupsList } from "../../lib/recognition";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

// A scoped (dept/team) achievement shows its target; "Org-wide" is the default so we hide it.
const scopeChip = (scope: string) => (scope && scope !== "Org-wide" ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">{scope}</span> : null);
function StatusChip({ status, from, until }: { status: AchStatus; from: string | null; until: string | null }) {
  if (status === "UPCOMING") return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">starts {from}</span>;
  if (status === "ENDED") return <span className="rounded bg-border px-1.5 py-0.5 text-xs text-muted">ended {until}</span>;
  return until ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">until {until}</span> : null;
}

export function AchievementsPage() {
  const { data: defs } = useAchievementDefs();
  const { data: mine } = useMyAchievements();
  const [editing, setEditing] = useState<AchievementDef | "new" | null>(null);
  const progress = mine?.achievements ?? [];
  const earned = progress.filter((a) => a.earned);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Achievements" subtitle="Earn badges for recognition, streaks, and competition wins." />

      <Card className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted">Earned ({earned.length})</h2>
        {earned.length === 0 ? (
          <p className="text-sm text-muted">None yet — keep checking in, giving big-ups, and competing.</p>
        ) : (
          <div className="flex flex-wrap gap-2">{earned.map((a) => <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800" title={a.description ?? ""}>{a.icon ?? "🏅"} {a.name}</span>)}</div>
        )}
      </Card>

      <Card className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">In progress</h2>
          {defs?.canManage && editing === null && <button onClick={() => setEditing("new")} className="text-xs text-primary hover:underline">+ New achievement</button>}
        </div>
        {editing !== null && defs?.canManage && <DefForm def={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
        {progress.filter((a) => !a.earned).length === 0 ? (
          <p className="text-sm text-muted">{defs && defs.achievements.length === 0 ? "No achievements defined yet." : "You've earned everything available 🎉"}</p>
        ) : (
          <div className="space-y-3">
            {progress.filter((a) => !a.earned).map((a) => {
              const pct = Math.min(100, Math.round((a.value / a.threshold) * 100));
              return (
                <div key={a.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-fg">{a.icon ?? "🏅"} {a.name} {a.category && <span className="text-xs text-muted">· {a.category}</span>} {scopeChip(a.scope)} <StatusChip status={a.status} from={a.activeFrom} until={a.activeUntil} /></span>
                    <span className="text-xs text-muted">{a.value}/{a.threshold} {metricLabel(a.metric).toLowerCase()}{a.period === "MONTHLY" ? " (this month)" : ""}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/60"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {defs?.canManage && defs.achievements.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-muted">Manage</h2>
          <ul className="divide-y divide-border text-sm">
            {defs.achievements.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <span>{d.icon ?? "🏅"}</span>
                <span className="flex flex-1 items-center gap-1.5 text-fg">{d.name} <span className="text-xs text-muted">· {metricLabel(d.metric)} ≥ {d.threshold} · {d.period.toLowerCase()}</span> {scopeChip(d.scope)} <StatusChip status={d.status} from={d.activeFrom} until={d.activeUntil} /></span>
                <button onClick={() => setEditing(d)} className="text-xs text-primary hover:underline">edit</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function DefForm({ def, onClose }: { def: AchievementDef | null; onClose: () => void }) {
  const save = useSaveAchievement();
  const del = useDeleteAchievement();
  const nodes = useOrgNodes();
  const groups = useGroupsList();
  const [f, setF] = useState<DefInput>({ name: def?.name ?? "", description: def?.description ?? "", category: def?.category ?? "", icon: def?.icon ?? "🏅", metric: def?.metric ?? "BIGUPS_RECEIVED", threshold: def?.threshold ?? 10, period: def?.period ?? "LIFETIME", scopeKind: def?.scopeKind ?? "ALL", scopeId: def?.scopeId ?? null, activeFrom: def?.activeFrom ?? null, activeUntil: def?.activeUntil ?? null });
  const set = (k: keyof DefInput, v: string | number | null) => setF({ ...f, [k]: v });
  const needsTarget = f.scopeKind === "NODE" || f.scopeKind === "GROUP";
  return (
    <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex gap-2">
        <Input className="w-16" value={f.icon} onChange={(e) => set("icon", e.target.value)} placeholder="🏅" />
        <Input className="flex-1" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Name (e.g. Cheerleader)" />
        <Input className="w-40" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Category" />
      </div>
      <Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Description (optional)" />
      <div className="flex flex-wrap gap-2">
        <select value={f.metric} onChange={(e) => set("metric", e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <span className="self-center text-sm text-muted">≥</span>
        <Input className="w-24" type="number" value={String(f.threshold)} onChange={(e) => set("threshold", Number(e.target.value))} />
        <select value={f.period} onChange={(e) => set("period", e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm"><option value="LIFETIME">Lifetime</option><option value="MONTHLY">Monthly</option></select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={f.scopeKind} onChange={(e) => setF({ ...f, scopeKind: e.target.value as DefInput["scopeKind"], scopeId: null })} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
          <option value="ALL">Everyone</option><option value="NODE">A department</option><option value="GROUP">A team</option>
        </select>
        {f.scopeKind === "NODE" && (
          <select value={f.scopeId ?? ""} onChange={(e) => set("scopeId", e.target.value || null)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
            <option value="">Which department?</option>{(nodes.data?.nodes ?? []).filter((n) => n.nodeType !== "ORG").map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        {f.scopeKind === "GROUP" && (
          <select value={f.scopeId ?? ""} onChange={(e) => set("scopeId", e.target.value || null)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
            <option value="">Which team?</option>{(groups.data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Runs</span>
        <input type="date" value={f.activeFrom ?? ""} onChange={(e) => set("activeFrom", e.target.value || null)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
        <span>→</span>
        <input type="date" value={f.activeUntil ?? ""} onChange={(e) => set("activeUntil", e.target.value || null)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
        <span className="text-xs">(optional — leave blank for always-on)</span>
      </div>
      <div className="flex gap-2">
        <Button disabled={!f.name.trim() || f.threshold < 1 || (needsTarget && !f.scopeId) || save.isPending} onClick={() => save.mutate({ id: def?.id, data: { ...f, description: f.description?.trim() || undefined, category: f.category?.trim() || undefined } }, { onSuccess: onClose })}>{def ? "Save" : "Create"}</Button>
        {def && <button onClick={() => del.mutate(def.id, { onSuccess: onClose })} className="text-sm text-red-600 hover:underline">Delete</button>}
        <button onClick={onClose} className="ml-auto text-sm text-muted hover:underline">Cancel</button>
      </div>
    </div>
  );
}
