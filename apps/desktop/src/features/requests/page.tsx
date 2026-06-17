import { useState } from "react";
import { type RequestItem, useCreateRequest, useGroupList, useRequests, useReviewRequest } from "../../lib/requests";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const STATUS_STYLE: Record<string, string> = { PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-emerald-100 text-emerald-700", REJECTED: "bg-red-100 text-red-600" };

function statusChip(s: string) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[s] ?? "bg-border/60 text-muted"}`}>{s.toLowerCase()}</span>;
}

function desc(r: RequestItem): string {
  if (r.kind === "PERMISSION_GRANT") return `Join "${r.groupName ?? "?"}"${r.subjectName ? ` — ${r.subjectName}` : ""}`;
  return r.title ?? "Request";
}

export function RequestsPage() {
  const { data } = useRequests();
  const { data: groupData } = useGroupList();
  const create = useCreateRequest();
  const approve = useReviewRequest("approve");
  const reject = useReviewRequest("reject");
  const [group, setGroup] = useState("");
  const [title, setTitle] = useState("");

  const groups = groupData?.groups ?? [];
  const mine = data?.mine ?? [];
  const queue = data?.queue ?? [];

  return (
    <div className="max-w-2xl">
      <PageHeader title="Requests" subtitle="Ask to join a permission group or raise a request. Sensitive grants need more than one approver." />

      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Request to join a permission group…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} (L{g.level})</option>)}
          </select>
          <Button onClick={() => group && create.mutate({ kind: "PERMISSION_GRANT", groupId: group }, { onSuccess: () => setGroup("") })} disabled={!group || create.isPending}>Request</Button>
        </div>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Other request (e.g. pin a notice to the org board)" className="flex-1" />
          <Button variant="ghost" onClick={() => title.trim() && create.mutate({ kind: "GENERIC", title: title.trim() }, { onSuccess: () => setTitle("") })} disabled={!title.trim() || create.isPending}>Submit</Button>
        </div>
      </Card>

      {queue.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Awaiting your approval ({queue.length})</h2>
          <ul className="space-y-2 text-sm">
            {queue.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{desc(r)} <span className="text-xs text-muted">· by {r.creatorName}</span></span>
                <span className="text-xs text-muted">{r.approvals}/{r.requiredApprovals} approvals</span>
                {r.iApproved ? (
                  <span className="text-xs text-emerald-600">you approved ✓</span>
                ) : (
                  <button onClick={() => approve.mutate(r.id)} className="text-xs text-primary hover:underline">approve</button>
                )}
                <button onClick={() => reject.mutate(r.id)} className="text-xs text-red-600 hover:underline">reject</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-muted">My requests</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">You haven't made any requests.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {mine.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">{desc(r)}</span>
                {r.status === "PENDING" && r.requiredApprovals > 1 && <span className="text-xs text-muted">{r.approvals}/{r.requiredApprovals}</span>}
                {statusChip(r.status)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
