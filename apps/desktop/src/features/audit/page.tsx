import { useState } from "react";
import { type AuditEntry, downloadAuditCsv, useAuditLog, useAuditVerify } from "../../lib/audit";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// "session.role_set" → "session · role set"
function label(action: string): string {
  return action.replace(/[._]/g, (m) => (m === "." ? " · " : " "));
}

function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  return Object.entries(meta)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ");
}

export function AuditPage() {
  const { data, isLoading } = useAuditLog();
  const { data: verify } = useAuditVerify();
  const [explain, setExplain] = useState(false);
  const entries = data?.entries ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-2">
        <PageHeader title="Audit log" subtitle="A tamper-evident, append-only record of privileged actions." />
        <Button variant="ghost" onClick={() => downloadAuditCsv()}>Export CSV</Button>
      </div>

      {verify && (
        <div className="mb-4">
          <button onClick={() => setExplain((v) => !v)} className="flex items-center gap-1 text-xs">
            <span className={verify.ok ? "text-emerald-700" : "text-red-600"}>{verify.ok ? "🛡 Trail integrity verified" : "⚠ Trail integrity check failed"}</span>
            <span className="text-muted">· {verify.count} entries {explain ? "▾" : "▸"}</span>
          </button>
          {explain && (
            <div className="mt-1 rounded-lg border border-border bg-bg p-3 text-xs text-muted">
              {verify.ok ? (
                <p className="mb-2 text-emerald-700">The hash chain is intact — no entry has been altered, removed, or reordered.</p>
              ) : (
                <p className="mb-2 font-medium text-red-600">The chain breaks at entry #{verify.brokenAtId} — an entry at or before it was altered, removed, or reordered.</p>
              )}
              <p className="mb-1"><span className="font-medium text-fg">Why it matters:</span> for audits (and government work) the record has to be trustworthy — you need to prove the log wasn't quietly edited after the fact.</p>
              <p><span className="font-medium text-fg">How it works:</span> the log is append-only, and each entry stores a SHA-256 hash of its own contents <em>plus the previous entry's hash</em> — a chain. Changing, deleting, or reordering any past entry changes its hash, which breaks every entry after it. "Verify" recomputes the whole chain from scratch and flags the first mismatch, so tampering can't go unnoticed.</p>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <Card><p className="text-sm text-muted">No audit entries yet.</p></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {entries.map((e: AuditEntry) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-36 shrink-0 text-xs text-muted">{when(e.at)}</span>
                <span className="font-medium">{label(e.action)}</span>
                <span className="text-muted">· {e.actorName}</span>
                {e.meta && <span className="w-full pl-36 text-xs text-muted">{metaSummary(e.meta)}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
