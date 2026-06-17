import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useMeInvites } from "../../lib/sessions";
import { TaskFeed } from "../tasks/feed";
import { Card } from "../../ui/card";
import { PageHeader } from "../../ui/page-header";

type OrgNode = { id: string; name: string; nodeType: string; path: string };

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: invites } = useMeInvites();
  const { data, isLoading } = useQuery({
    queryKey: ["org-nodes"],
    queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes"),
  });

  const active = invites?.invites ?? [];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your organization at a glance." />

      {active.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">Invitations & live sessions</h2>
          <ul className="space-y-1">
            {active.map((i) => {
              const sched = i.state === "SCHEDULED";
              return (
                <li key={i.id} className="flex items-center justify-between text-sm">
                  <span>
                    {i.title}{" "}
                    <span className="text-xs text-muted">
                      · {i.hostName} · {sched ? (i.scheduledAt ? new Date(i.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "scheduled") : "live now"}
                    </span>
                  </span>
                  <button onClick={() => navigate(`/sessions/${i.id}`)} className="text-xs text-primary hover:underline">
                    {sched ? "View" : i.myState === "JOINED" ? "Open" : "Join"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Recent task activity</h2>
        <TaskFeed limit={3} seeAll />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Org structure</h2>
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {data && data.nodes.length === 0 && (
          <p className="text-sm text-muted">No org nodes yet. Add them under Org structure.</p>
        )}
        <ul className="space-y-1">
          {data?.nodes.map((n) => (
            <li key={n.id} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{n.nodeType}</span>
              <span>{n.name}</span>
              <span className="text-xs text-muted">{n.path}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
