import { useState } from "react";
import { type Suggestion, type SuggestionKind, type SuggestionStatus, useClaim, useComplaintRoutes, useManageSuggestion, useSubmitSuggestion, useSuggestions, useVoteSuggestion } from "../../lib/suggestions";
import { useWellnessResources } from "../../lib/wellness";
import { useReportContent } from "../../lib/moderation";
import { useMe } from "../../lib/auth";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const CATEGORY_LABEL: Record<string, string> = {
  HARASSMENT: "Harassment/discrimination", PAY: "Pay & benefits", WORKLOAD: "Workload & wellbeing",
  MANAGEMENT: "Management", FACILITIES: "Facilities", SAFETY: "Health & safety", OTHER: "Other",
};

const STATUS: Record<SuggestionStatus, { label: string; cls: string }> = {
  NEW: { label: "New", cls: "bg-sky-100 text-sky-700" },
  REVIEWING: { label: "Under review", cls: "bg-amber-100 text-amber-700" },
  PLANNED: { label: "Planned", cls: "bg-violet-100 text-violet-700" },
  DONE: { label: "Done", cls: "bg-emerald-100 text-emerald-700" },
  DECLINED: { label: "Declined", cls: "bg-border text-muted" },
};

export function SuggestionsPage() {
  const { data } = useSuggestions();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Suggestion & complaint box" subtitle="Anonymous by design — we never store who you are. Suggestions are public to upvote; complaints go privately to the people who can act on them." />
      <Submit />
      <FollowUp />
      <div className="mt-6 space-y-2">
        {data?.suggestions.length === 0 && <Card><p className="text-sm text-muted">Nothing here yet — be the first to share something.</p></Card>}
        {data?.suggestions.map((s) => <Item key={s.id} s={s} />)}
      </div>
    </div>
  );
}

function Submit() {
  const submit = useSubmitSuggestion();
  const { data: me } = useMe();
  const { data: routing } = useComplaintRoutes();
  const [kind, setKind] = useState<SuggestionKind>("SUGGESTION");
  const [box, setBox] = useState<"ALL" | "NODE">("ALL");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [category, setCategory] = useState("");
  const [ticket, setTicket] = useState<{ id: string; ticket: string; urgent: boolean } | null>(null);

  const routeFor = routing?.routes.find((r) => r.category === category);

  const send = () => {
    if (body.trim().length < 3) return;
    const wasUrgent = kind === "COMPLAINT" && urgent;
    submit.mutate({ kind, body: body.trim(), scopeKind: box, scopeId: box === "NODE" ? me?.nodeId : undefined, urgent: wasUrgent, category: kind === "COMPLAINT" && category ? category : undefined }, { onSuccess: (r) => { setTicket({ ...r, urgent: wasUrgent }); setBody(""); setUrgent(false); setCategory(""); } });
  };

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {(["SUGGESTION", "COMPLAINT"] as const).map((k) => (
          <button key={k} onClick={() => { setKind(k); if (k === "SUGGESTION") { setUrgent(false); setCategory(""); } }} className={`rounded-lg px-3 py-1.5 ${kind === k ? "bg-primary/10 font-medium text-primary" : "text-muted hover:text-fg"}`}>{k === "SUGGESTION" ? "💡 Suggestion" : "🛡️ Complaint"}</button>
        ))}
        {me?.nodeId && (
          <select value={box} onChange={(e) => setBox(e.target.value as "ALL" | "NODE")} className="ml-auto rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-muted">
            <option value="ALL">Org-wide box</option><option value="NODE">My department</option>
          </select>
        )}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder={kind === "SUGGESTION" ? "What would make things better?" : "What's the issue? This goes privately to people who can act on it."} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      {kind === "COMPLAINT" && (
        <div className="space-y-1">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
            <option value="">What's it about? (optional)</option>
            {routing?.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {routeFor && <p className="text-xs text-muted">↳ Goes privately to the <span className="font-medium text-fg">{routeFor.nodeName}</span> team. You stay anonymous.</p>}
        </div>
      )}
      {kind === "COMPLAINT" && (
        <label className="flex items-start gap-2 rounded-lg border border-border p-2 text-xs text-muted">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-0.5" />
          <span><span className="font-medium text-rose-600">🚩 This is urgent — a safety or harm concern.</span> Flags it for immediate attention by the people who can help. You stay anonymous either way.</span>
        </label>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={send} disabled={body.trim().length < 3 || submit.isPending}>Submit anonymously</Button>
        <span className="text-xs text-muted">No name, no IP, no timestamp is stored.</span>
      </div>
      {ticket && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <div className="font-medium text-fg">Saved. Keep this to check back later (it's the only way — we can't look you up):</div>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-[11px]">ref {ticket.id} · code {ticket.ticket}</code>
          {ticket.urgent && <SupportResources />}
        </div>
      )}
    </Card>
  );
}

// Shown to someone who flags a complaint urgent — surfaces the institution's published support
// contacts immediately (reuses the wellness resources everyone can already see).
function SupportResources() {
  const { data } = useWellnessResources();
  const res = (data?.resources ?? []).filter((r) => r.published);
  return (
    <div className="mt-2 border-t border-primary/20 pt-2">
      <div className="font-medium text-fg">It's flagged for immediate attention. If you need support right now:</div>
      {res.length === 0 ? (
        <p className="mt-1 text-muted">Reach out to a manager, HR, or a trusted colleague. You don't have to handle this alone.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {res.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">{r.title}</span>
              {r.body && <span className="text-muted">{r.body}</span>}
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Info</a>}
              {r.email && <a href={`mailto:${r.email}`} className="text-primary hover:underline">Email</a>}
              {r.whatsapp && <a href={`https://wa.me/${r.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">WhatsApp</a>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FollowUp() {
  const claim = useClaim();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const result = claim.data;
  return (
    <Card className="mt-3">
      <button onClick={() => setOpen((o) => !o)} className="text-sm text-primary hover:underline">{open ? "Hide" : "Check on a submission you made"}</button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input className="w-72" placeholder="ref (id)" value={id} onChange={(e) => setId(e.target.value.trim())} />
            <Input className="w-48" placeholder="code" value={code} onChange={(e) => setCode(e.target.value.trim())} />
            <Button onClick={() => id && code && claim.mutate({ id, ticket: code })} disabled={!id || !code || claim.isPending}>Check status</Button>
          </div>
          {claim.isError && <p className="text-xs text-red-600">No match — check your ref and code.</p>}
          {result && (
            <div className="rounded-lg border border-border p-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[result.status].cls}`}>{STATUS[result.status].label}</span>
              <p className="mt-1 text-fg">{result.body}</p>
              {result.response && <p className="mt-1 text-xs text-muted">Response: {result.response}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Item({ s }: { s: Suggestion }) {
  const vote = useVoteSuggestion();
  const manage = useManageSuggestion();
  const report = useReportContent();
  const flagged = s.urgent && s.status !== "DONE" && s.status !== "DECLINED";
  const doReport = () => {
    if (report.isSuccess) return;
    const reason = prompt("Report this suggestion to moderators? Optionally say why:");
    if (reason === null) return; // cancelled
    report.mutate({ kind: "SUGGESTION", refId: s.id, reason: reason || undefined });
  };
  return (
    <Card className={`flex items-start gap-3 ${flagged ? "border-rose-300 bg-rose-50/50" : ""}`}>
      {s.kind === "SUGGESTION" ? (
        <button onClick={() => vote.mutate(s.id)} className={`flex w-11 shrink-0 flex-col items-center rounded-md border px-1 py-1 text-xs ${s.myVote ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-primary/50"}`}>
          <span className="leading-none">▲</span><span className="font-semibold">{s.votes}</span>
        </button>
      ) : (
        <span className="w-11 shrink-0 text-center text-lg" title="Complaint (private)">🛡️</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          {s.urgent && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">🚩 Urgent</span>}
          <span className={`rounded-full px-2 py-0.5 ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
          {s.category && <span className="rounded-full bg-border px-2 py-0.5 text-muted">{CATEGORY_LABEL[s.category] ?? s.category}</span>}
          <span className="text-muted">{s.scope} · {s.createdDay}</span>
        </div>
        <p className="text-sm text-fg">{s.body}</p>
        {s.kind === "SUGGESTION" && (
          <button onClick={doReport} disabled={report.isPending || report.isSuccess} className="mt-1 text-xs text-muted hover:text-rose-600">
            {report.isSuccess ? "✓ Reported" : "⚑ Report"}
          </button>
        )}
        {s.canManage && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
            {(["NEW", "REVIEWING", "PLANNED", "DONE", "DECLINED"] as SuggestionStatus[]).map((st) => (
              <button key={st} onClick={() => manage.mutate({ id: s.id, status: st })} disabled={manage.isPending || s.status === st} className={`rounded px-2 py-0.5 text-xs ${s.status === st ? STATUS[st].cls : "text-muted hover:text-fg"}`}>{STATUS[st].label}</button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
