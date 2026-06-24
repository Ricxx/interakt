import { useReports, useResolveReport, type Report } from "../../lib/moderation";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

export function ModerationPage() {
  const { data, isLoading } = useReports();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Moderation" subtitle="Reported photos and posts. Hide anything that breaks the rules, or dismiss the report." />
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {data && !data.canModerate && <Card><p className="text-sm text-muted">You don't have moderation access.</p></Card>}
      {data?.canModerate && data.items.length === 0 && <Card><p className="text-sm text-muted">Nothing reported. All clear. 🎉</p></Card>}
      <div className="space-y-2">
        {data?.items.map((r) => <Row key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function Row({ r }: { r: Report }) {
  const resolve = useResolveReport();
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-border px-2 py-0.5">{r.kind === "PHOTO" ? "📷 Photo" : "💡 Suggestion"}</span>
        <span>reported by {r.by}</span>
        <span className="ml-auto">{new Date(r.at).toLocaleDateString()}</span>
      </div>
      {r.kind === "PHOTO" ? (
        <img src={r.preview} alt={r.caption || "reported"} className="max-h-48 rounded-lg object-cover" />
      ) : (
        <p className="rounded-lg border border-border bg-bg p-2 text-sm">{r.preview}</p>
      )}
      {r.reason && <p className="text-sm text-muted"><span className="font-medium">Reason:</span> {r.reason}</p>}
      <div className="flex gap-2 border-t border-border pt-2">
        <Button variant="danger" onClick={() => resolve.mutate({ id: r.id, action: "HIDE" })} disabled={resolve.isPending}>Hide content</Button>
        <Button variant="ghost" onClick={() => resolve.mutate({ id: r.id, action: "DISMISS" })} disabled={resolve.isPending}>Dismiss report</Button>
      </div>
    </Card>
  );
}
