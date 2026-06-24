import { type BugReport, useBugReports, useHandleBug } from "../../lib/feedback";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

const STATUS: Record<string, string> = { NEW: "bg-sky-100 text-sky-700", FORWARDED: "bg-violet-100 text-violet-700", CLOSED: "bg-border text-muted" };

export function FeedbackInboxPage() {
  const { data } = useBugReports();
  const { forward, close } = useHandleBug();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Feedback inbox" subtitle="Bug reports and ideas from your team. Forward the useful ones to the makers." />
      {data && data.items.length === 0 && <Card><p className="text-sm text-muted">No reports yet.</p></Card>}
      <div className="space-y-2">
        {data?.items.map((r: BugReport) => (
          <Card key={r.id} className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>{r.kind === "BUG" ? "🐞 Bug" : "💡 Idea"}</span>
              <span className={`rounded-full px-2 py-0.5 ${STATUS[r.status]}`}>{r.status.toLowerCase()}</span>
              <span>· {r.by}</span>
              {r.page && <span>· <code className="text-[11px]">{r.page}</code></span>}
              <span className="ml-auto">{new Date(r.at).toLocaleDateString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-fg">{r.message}</p>
            {r.status === "NEW" && (
              <div className="flex gap-2 border-t border-border pt-2">
                <Button variant="subtle" disabled={forward.isPending} onClick={() => forward.mutate(r.id)}>Forward to makers</Button>
                <Button variant="ghost" disabled={close.isPending} onClick={() => close.mutate(r.id)}>Close</Button>
              </div>
            )}
            {r.status === "FORWARDED" && <p className="border-t border-border pt-2 text-xs text-violet-600">Forwarded to the makers.</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
