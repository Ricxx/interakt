import { useState, type ReactNode } from "react";
import { type AugmentKind, type ItemInput, type MarketItem, type RedeemResult, useDeleteItem, useMarket, useMyRedemptions, useRedeem, useSales, useSaveItem } from "../../lib/market";
import { NAME_COLORS } from "../../lib/profile";
import { uploadImage } from "../../lib/upload";
import { EmojiPicker } from "../../ui/emoji-picker";
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
  const [bought, setBought] = useState<RedeemResult | null>(null);
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
            const soldOut = it.stock === 0;
            return (
              <Card key={it.id} className={`flex items-start gap-3 ${it.active ? "" : "opacity-60"}`}>
                {it.image ? <img src={it.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-border/30 text-3xl">{it.icon ?? "🎁"}</span>}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg">{it.name} {it.kind === "PROFILE" && it.augment && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">{augmentLabel(it.augmentKind, it.augment)}</span>} {!it.active && <span className="text-xs text-muted">(hidden)</span>}</div>
                  {it.description && <p className="text-sm text-muted">{it.description}</p>}
                  <div className="mt-1 text-xs text-muted">{it.stock == null ? "In stock" : soldOut ? <span className="font-medium text-red-600">Sold out</span> : `${it.stock} ${it.coded ? "code" : ""}${it.coded && it.stock === 1 ? "" : it.coded ? "s" : ""} left`}{it.redemptionInfo ? " · ⓘ redemption info" : ""}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{it.cost} pts</span>
                    <Button disabled={!afford || soldOut || redeem.isPending} onClick={() => redeem.mutate(it.id, { onSuccess: (r) => setBought(r) })}>{soldOut ? "Sold out" : afford ? "Redeem" : "Not enough"}</Button>
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
          <h2 className="mb-2 text-sm font-semibold text-muted">Your purchases</h2>
          <ul className="space-y-1.5 text-sm">{red.redemptions.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-fg">{r.itemName}{r.code && <code className="ml-2 rounded bg-border/50 px-1.5 py-0.5 text-xs text-fg">{r.code}</code>}</span>
              <span className="shrink-0 text-xs text-muted">−{r.cost} pts · {r.day}</span>
            </li>
          ))}</ul>
        </Card>
      )}

      {data.canManage && <Sales />}

      {bought && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBought(null)}>
          <Card className="w-full max-w-sm space-y-3 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl">🎉</div>
            <h3 className="text-sm font-semibold text-fg">Purchased!</h3>
            {bought.code && (
              <div>
                <div className="text-xs text-muted">Your code</div>
                <code className="mt-1 block break-all rounded-lg bg-border/40 px-3 py-2 text-base font-semibold text-fg">{bought.code}</code>
              </div>
            )}
            {bought.redemptionInfo && <p className="whitespace-pre-wrap rounded-lg border border-border p-2 text-left text-xs text-fg"><span className="text-muted">What's next: </span>{bought.redemptionInfo}</p>}
            {!bought.code && !bought.redemptionInfo && <p className="text-sm text-muted">It's in your purchases.</p>}
            <button onClick={() => setBought(null)} className="text-sm text-primary hover:underline">Done</button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Sales() {
  const { data } = useSales(true);
  const [open, setOpen] = useState(false);
  if (!data || data.sales.length === 0) return null;
  const total = data.sales.reduce((a, s) => a + s.cost, 0);
  return (
    <Card className="mt-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-semibold text-muted">
        <span>Purchase history — {data.sales.length} sale{data.sales.length === 1 ? "" : "s"} · {total} pts</span>
        <span className="text-xs text-primary">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-sm">
          {data.sales.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-fg">{s.buyer} <span className="text-muted">bought</span> {s.itemName}</span>
              <span className="shrink-0 text-xs text-muted">{s.cost} pts · {s.day}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const Label = ({ children }: { children: ReactNode }) => <label className="mb-1 block text-xs font-medium text-muted">{children}</label>;
const selectCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";

function Preview({ f, count }: { f: ItemInput; count: number | null }) {
  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-surface p-3">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted/70">Live preview</div>
      <div className="flex items-start gap-3">
        {f.image ? <img src={f.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-border/30 text-3xl">{f.icon || "🎁"}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{f.name || <span className="text-muted">Item name</span>}</div>
          {f.description && <p className="text-sm text-muted">{f.description}</p>}
          <div className="mt-1 text-xs text-muted">{count == null ? "In stock" : count === 0 ? "Sold out" : `${count} left`}{f.redemptionInfo?.trim() ? " · ⓘ redemption info" : ""}</div>
          <div className="mt-1.5 flex items-center gap-2"><span className="text-sm font-medium text-primary">{f.cost} pts</span><span className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-fg">Redeem</span></div>
        </div>
      </div>
    </div>
  );
}

function ItemForm({ item, onClose }: { item: MarketItem | null; onClose: () => void }) {
  const save = useSaveItem();
  const del = useDeleteItem();
  const [f, setF] = useState<ItemInput>({ name: item?.name ?? "", description: item?.description ?? "", icon: item?.icon ?? "🎁", image: item?.image ?? null, cost: item?.cost ?? 100, stock: item?.stock ?? null, redemptionInfo: item?.redemptionInfo ?? "", kind: item?.kind ?? "PERK", augment: item?.augment ?? "", augmentKind: item?.augmentKind ?? "FLAIR", active: item?.active ?? true });
  const [uploading, setUploading] = useState(false);
  const [stockNum, setStockNum] = useState(item?.stock ?? 10);
  const [codesText, setCodesText] = useState("");
  const codes = codesText.split("\n").map((c) => c.trim()).filter(Boolean);
  const hasCodes = codes.length > 0;
  const unlimited = f.stock == null;
  const profileValid = f.kind !== "PROFILE" || (f.augmentKind === "COLOR" ? !!f.augment : !!f.augment?.trim());
  const previewCount = hasCodes ? codes.length : f.stock ?? null;

  return (
    <Card className="mb-4 space-y-3 border-primary/30 bg-primary/5">
      <h3 className="text-sm font-semibold text-fg">{item ? "Edit item" : "Add a shop item"}</h3>

      <Preview f={f} count={previewCount} />

      {/* Picture — one image OR an emoji; the preview above shows how it'll look. */}
      <div>
        <Label>Picture</Label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-block cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg hover:bg-border/40">
            {uploading ? "Uploading…" : f.image ? "Replace image" : "Upload image"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const url = (await uploadImage(file)).url; setF((p) => ({ ...p, image: url })); } finally { setUploading(false); } }} />
          </label>
          {f.image ? (
            <button onClick={() => setF({ ...f, image: null })} className="text-xs text-muted hover:text-red-600">Remove image</button>
          ) : (
            <><span className="text-xs text-muted">or pick an emoji</span><EmojiPicker value={f.icon ?? "🎁"} onChange={(e) => setF({ ...f, icon: e })} /></>
          )}
        </div>
      </div>

      <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Coffee voucher" /></div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Cost (points)</Label><Input type="number" min={0} value={String(f.cost)} onChange={(e) => setF({ ...f, cost: Number(e.target.value) })} /></div>
        <div>
          <Label>Stock</Label>
          {hasCodes ? (
            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">{codes.length} (from codes)</div>
          ) : (
            <div className="flex items-center gap-2">
              <Input type="number" min={0} value={unlimited ? "" : String(stockNum)} disabled={unlimited} placeholder="∞" onChange={(e) => { const n = Number(e.target.value); setStockNum(n); setF({ ...f, stock: n }); }} />
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted"><input type="checkbox" checked={unlimited} onChange={(e) => setF({ ...f, stock: e.target.checked ? null : stockNum })} /> Unlimited</label>
            </div>
          )}
        </div>
      </div>

      <div><Label>Description (optional)</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Short description" /></div>

      <div><Label>What happens after buying (optional)</Label><textarea value={f.redemptionInfo} onChange={(e) => setF({ ...f, redemptionInfo: e.target.value })} rows={2} placeholder="e.g. Show this at the front desk, or email facilities@co with your code for the ticket." className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></div>

      <div>
        <Label>{item ? "Add redeemable codes — one per line (appends to the pool)" : "Redeemable codes — one per line (optional)"}</Label>
        <textarea value={codesText} onChange={(e) => setCodesText(e.target.value)} rows={2} placeholder={"STARBUCKS-ABC123\nSTARBUCKS-DEF456"} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono" />
        <p className="mt-0.5 text-[11px] text-muted/70">Each buyer gets one unique code; stock = number of codes left.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "PERK" | "PROFILE" })} className={selectCls}>
            <option value="PERK">Perk / reward</option><option value="PROFILE">Profile augment</option>
          </select>
        </div>
        {f.kind === "PROFILE" && (
          <div>
            <Label>Augment</Label>
            <select value={f.augmentKind} onChange={(e) => setF({ ...f, augmentKind: e.target.value as AugmentKind, augment: "" })} className={selectCls}>
              <option value="FLAIR">Flair (emoji)</option><option value="TITLE">Title</option><option value="COLOR">Name colour</option>
            </select>
          </div>
        )}
      </div>
      {f.kind === "PROFILE" && (
        <div>
          <Label>{f.augmentKind === "FLAIR" ? "Emoji the buyer can equip" : f.augmentKind === "TITLE" ? "Title the buyer can equip" : "Colour the buyer can equip"}</Label>
          {f.augmentKind === "FLAIR" && <EmojiPicker value={f.augment || "✨"} onChange={(e) => setF({ ...f, augment: e })} />}
          {f.augmentKind === "TITLE" && <Input value={f.augment} onChange={(e) => setF({ ...f, augment: e.target.value })} placeholder="e.g. Code Wizard" />}
          {f.augmentKind === "COLOR" && (
            <select value={f.augment} onChange={(e) => setF({ ...f, augment: e.target.value })} className={selectCls}>
              <option value="">Choose a colour…</option>{COLOR_TOKENS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible in the shop</label>

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <Button disabled={!f.name.trim() || !profileValid || save.isPending} onClick={() => save.mutate({ id: item?.id, data: { ...f, description: f.description?.trim() || undefined, redemptionInfo: f.redemptionInfo?.trim() || undefined, codes: codes.length ? codes : undefined } }, { onSuccess: onClose })}>{item ? "Save changes" : "Add to shop"}</Button>
        {item && <button onClick={() => del.mutate(item.id, { onSuccess: onClose })} className="text-sm text-red-600 hover:underline">Delete</button>}
        <button onClick={onClose} className="ml-auto text-sm text-muted hover:underline">Cancel</button>
      </div>
    </Card>
  );
}
