import { useHighlights } from "../../lib/highlights";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HighlightsPage() {
  const { data, isLoading } = useHighlights();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Highlights" subtitle="The good stuff — recognition, achievements and events from across the team." />
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {data && data.items.length === 0 && (
        <Card><p className="text-sm text-muted">No highlights yet. Give someone a shout-out or run an event and it'll show up here.</p></Card>
      )}
      <div className="relative space-y-2">
        {data?.items.map((h) => (
          <Card key={h.id} className="flex items-start gap-3">
            <div className="text-2xl leading-none">{h.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{h.title}</div>
              {h.body && <p className="text-sm text-muted">{h.body}</p>}
            </div>
            <span className="shrink-0 text-xs text-muted">{when(h.at)}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
