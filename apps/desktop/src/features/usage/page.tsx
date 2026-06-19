import { activityLabel, useUsage, useUsageAccess } from "../../lib/usage";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";

export function UsagePage() {
  const access = useUsageAccess();
  const { data } = useUsage(access.data?.canView === true && access.data?.enabled === true);

  if (access.data && !access.data.canView) return <div className="max-w-3xl"><PageHeader title="Usage" subtitle="Activity overview." /><Card><p className="text-sm text-muted">You don't have access to the usage log.</p></Card></div>;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Usage" subtitle="A light read on who's been active — sessions joined and what was played. No content, ever." />
      {access.data && !access.data.enabled ? (
        <Card><p className="text-sm text-muted">The usage log is turned off for this workspace. An admin can enable it in Settings.</p></Card>
      ) : !data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data.sessions.length === 0 ? (
        <Card><p className="text-sm text-muted">No activity in the last 30 days{data.reach === "NODE" ? " in your area" : ""}.</p></Card>
      ) : (
        <div className="space-y-2">
          {data.sessions.map((s) => (
            <Card key={s.id} className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">{s.title}</span>
                <span className="text-xs text-muted">{s.day}</span>
              </div>
              <p className="mt-0.5 text-sm text-muted">{s.people.join(", ")}</p>
              {s.activities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.activities.map((a, i) => <span key={i} className="rounded-full bg-border/60 px-2 py-0.5 text-[11px] text-muted">{activityLabel(a)}</span>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
