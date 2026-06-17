import { useState } from "react";
import { useMe } from "../../lib/auth";
import { type PendingItem, REPO_CATEGORIES, useAddRepoItem, useRepoItems, useRepoPending, useRepoScopes, useReviewRepoItem } from "../../lib/repo";
import { ItemRow } from "./item";
import { RepoManage } from "./manage";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

export function RepoPage() {
  const { data: me } = useMe();
  const { data: itemsData, isLoading } = useRepoItems();
  const { data: scopeData } = useRepoScopes();
  const { data: pendingData } = useRepoPending();
  const add = useAddRepoItem();
  const approve = useReviewRepoItem("approve");
  const reject = useReviewRepoItem("reject");

  const [kind, setKind] = useState("LINK");
  const [category, setCategory] = useState("GENERAL");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState("");
  const [node, setNode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState("ALL");
  const [search, setSearch] = useState("");

  const scopes = scopeData?.scopes ?? [];
  const allItems = itemsData?.items ?? [];
  const pending = pendingData?.items ?? [];
  const canSubmit = title.trim() && node && (kind === "LINK" ? url.trim() : body.trim());

  const q = search.trim().toLowerCase();
  const items = allItems.filter((it) => {
    if (activeCat !== "ALL" && it.category !== activeCat) return false;
    if (!q) return true;
    return [it.title, it.body, it.url, it.submitterName, it.nodeName].some((f) => (f ?? "").toLowerCase().includes(q));
  });

  function submit() {
    if (!canSubmit) return;
    add.mutate(
      { kind, category, title: title.trim(), nodeId: node, url: kind === "LINK" ? url.trim() : null, body: body.trim() || null, itemDate: date || null },
      {
        onSuccess: (r) => {
          setNote(r.status === "PENDING" ? "Submitted for review — an approver will publish it." : "Published.");
          setTitle(""); setUrl(""); setBody(""); setDate("");
        },
      },
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Repository" subtitle="Useful links and tidbits, shared across your team, department, division, or org. Link to sensitive files in your own systems — don't upload them here." />

      {/* Add */}
      <Card className="mb-4 space-y-2">
        <div className="flex gap-2">
          <div className="flex gap-1 rounded-lg bg-bg p-0.5 text-xs">
            <button onClick={() => setKind("LINK")} className={tab(kind === "LINK")}>Link</button>
            <button onClick={() => setKind("TEXT")} className={tab(kind === "TEXT")}>Tidbit</button>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-sm">
            {REPO_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {kind === "LINK" && <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
        <Input placeholder={kind === "TEXT" ? "The note / tidbit" : "Description (optional)"} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <select value={node} onChange={(e) => setNode(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Share with…</option>
            {scopes.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.nodeType.toLowerCase()})</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" title="Relevant date (optional)" />
          <Button onClick={submit} disabled={!canSubmit || add.isPending}>Add</Button>
        </div>
        {scopes.length === 0 && <p className="text-xs text-muted">You're not assigned to a team yet, so there's nowhere to share to.</p>}
        {note && <p className="text-xs text-emerald-600">{note}</p>}
      </Card>

      {/* Pending review (approvers) */}
      {pending.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Awaiting your review ({pending.length})</h2>
          <ul className="space-y-2">
            {pending.map((p) => <PendingRow key={p.id} item={p} onApprove={() => approve.mutate(p.id)} onReject={() => reject.mutate(p.id)} />)}
          </ul>
        </Card>
      )}

      {/* Tabs + search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {[{ key: "ALL", label: "All" }, ...REPO_CATEGORIES].map((c) => (
            <button key={c.key} onClick={() => setActiveCat(c.key)} className={cn("rounded-md px-2 py-1 text-xs font-medium", activeCat === c.key ? "bg-primary/10 text-primary" : "text-muted hover:text-fg")}>{c.label}</button>
          ))}
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="ml-auto max-w-48" />
      </div>

      {/* Browse */}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <Card><p className="text-sm text-muted">{allItems.length === 0 ? "Nothing here yet. Add a useful link or tidbit above." : "Nothing matches."}</p></Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => <ItemRow key={it.id} item={it} />)}
        </div>
      )}

      {me?.role === "TENANT_ADMIN" && <RepoManage />}
    </div>
  );
}

function tab(active: boolean): string {
  return `rounded-md px-3 py-1 font-medium ${active ? "bg-primary/10 text-primary" : "text-muted"}`;
}

function PendingRow({ item, onApprove, onReject }: { item: PendingItem; onApprove: () => void; onReject: () => void }) {
  return (
    <li className="rounded-lg border border-border p-2 text-sm">
      <div className="font-medium">{item.kind === "LINK" ? "🔗 " : "📝 "}{item.title}</div>
      {item.url && <div className="truncate text-xs text-muted">{item.url}</div>}
      {item.body && <div className="text-xs text-muted">{item.body}</div>}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-muted">{item.nodeName} · by {item.submitterName}</span>
        <span className="flex gap-3">
          <button onClick={onApprove} className="text-xs text-primary hover:underline">approve</button>
          <button onClick={onReject} className="text-xs text-red-600 hover:underline">reject</button>
        </span>
      </div>
    </li>
  );
}
