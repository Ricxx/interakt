import { useState } from "react";
import { type AugmentKind, type ItemInput, type MarketItem, useDeleteItem, useMarket, useMyRedemptions, useRedeem, useSaveItem } from "../../lib/market";
import { NAME_COLORS } from "../../lib/profile";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const COLOR_TOKENS = Object.keys(NAME_COLORS);
const augmentLabel = (kind: AugmentKind | null, augment: string) =>
  kind === "TITLE" ? `title “${augment}”` : kind === "COLOR" ? `colour ${augment}` : `flair ${augment}`;

export function MarketPage() {
  const { data } = useMarket();
  const { data: red } = useMyRedemptions();
  const redeem = useRedeem();
  const [editing, setEditing] = useState<MarketItem | "new" | null>(null);
  if (!data) return <div className="p-2 text-sm text-muted">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Shop" subtitle="Spend your points on perks, rewards, and profile bits." />

      <Card className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted">Your balance: <span className="text-lg font-semibold text-fg">{data.balance}</span> points</span>
        {data.canManage && editing === null && <button onClick={() => setEditing("new")} className="text-xs text-primary hover:underline">+ Add item</button>}
      </Card>

      {editing !== null && data.canManage && <ItemForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      {data.items.length === 0 ? (
        <Card><p className="text-sm text-muted">The shop is empty{data.canManage ? " — add an item above." : "."}</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.items.map((it) => {
            const afford = data.balance >= it.cost;
            return (
              <Card key={it.id} className={`flex items-start gap-3 ${it.active ? "" : "opacity-60"}`}>
                <span className="text-3xl">{it.icon ?? "🎁"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg">{it.name} {it.kind === "PROFILE" && it.augment && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">{augmentLabel(it.augmentKind, it.augment)}</span>} {!it.active && <span className="text-xs text-muted">(hidden)</span>}</div>
                  {it.description && <p className="text-sm text-muted">{it.description}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{it.cost} pts</span>
                    <Button disabled={!afford || redeem.isPending} onClick={() => redeem.mutate(it.id)}>{afford ? "Redeem" : "Not enough"}</Button>
                    {data.canManage && <button onClick={() => setEditing(it)} className="text-xs text-muted hover:text-primary">edit</button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {red && red.redemptions.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">Your redemptions</h2>
          <ul className="space-y-1 text-sm">{red.redemptions.map((r, i) => <li key={i} className="flex items-center justify-between"><span className="text-fg">{r.itemName}</span><span className="text-xs text-muted">−{r.cost} pts · {r.day}</span></li>)}</ul>
        </Card>
      )}
    </div>
  );
}

function ItemForm({ item, onClose }: { item: MarketItem | null; onClose: () => void }) {
  const save = useSaveItem();
  const del = useDeleteItem();
  const [f, setF] = useState<ItemInput>({ name: item?.name ?? "", description: item?.description ?? "", icon: item?.icon ?? "🎁", cost: item?.cost ?? 100, kind: item?.kind ?? "PERK", augment: item?.augment ?? "", augmentKind: item?.augmentKind ?? "FLAIR", active: item?.active ?? true });
  return (
    <Card className="mb-4 space-y-2 border-primary/30 bg-primary/5">
      <div className="flex gap-2">
        <Input className="w-16" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} placeholder="🎁" />
        <Input className="flex-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Item name" />
        <Input className="w-24" type="number" value={String(f.cost)} onChange={(e) => setF({ ...f, cost: Number(e.target.value) })} placeholder="Cost" />
      </div>
      <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description (optional)" />
      <div className="flex items-center gap-2">
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "PERK" | "PROFILE" })} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
          <option value="PERK">Perk / reward</option><option value="PROFILE">Profile augment</option>
        </select>
        {f.kind === "PROFILE" && (
          <select value={f.augmentKind} onChange={(e) => setF({ ...f, augmentKind: e.target.value as AugmentKind, augment: "" })} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
            <option value="FLAIR">Flair (emoji)</option><option value="TITLE">Title</option><option value="COLOR">Name colour</option>
          </select>
        )}
        {f.kind === "PROFILE" && f.augmentKind === "FLAIR" && <Input className="w-20" value={f.augment} onChange={(e) => setF({ ...f, augment: e.target.value })} placeholder="✨" title="The flair the buyer can equip" />}
        {f.kind === "PROFILE" && f.augmentKind === "TITLE" && <Input className="flex-1" value={f.augment} onChange={(e) => setF({ ...f, augment: e.target.value })} placeholder="e.g. Code Wizard" title="The title the buyer can equip" />}
        {f.kind === "PROFILE" && f.augmentKind === "COLOR" && (
          <select value={f.augment} onChange={(e) => setF({ ...f, augment: e.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
            <option value="">colour…</option>{COLOR_TOKENS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible in the shop</label>
      <div className="flex gap-2">
        <Button disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate({ id: item?.id, data: { ...f, description: f.description?.trim() || undefined } }, { onSuccess: onClose })}>{item ? "Save" : "Add"}</Button>
        {item && <button onClick={() => del.mutate(item.id, { onSuccess: onClose })} className="text-sm text-red-600 hover:underline">Delete</button>}
        <button onClick={onClose} className="ml-auto text-sm text-muted hover:underline">Cancel</button>
      </div>
    </Card>
  );
}
