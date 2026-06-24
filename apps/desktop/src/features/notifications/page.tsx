import { useEffect } from "react";
import { useNotifications, useMarkNotificationsRead } from "../../lib/notifications";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";

// Short relative time ("2h ago") — good enough for an inbox; no library needed.
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const since = data?.lastSeenAt;

  // Opening the inbox clears the unread badge (mark seen once, after the feed loads).
  useEffect(() => {
    if (data && data.unread > 0) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.lastSeenAt]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Notifications" subtitle="Gifts, recognition and achievements that came your way." />
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {data && data.items.length === 0 && (
        <Card><p className="text-sm text-muted">Nothing yet. When a colleague gifts you points, recognises you, or you earn an achievement, it shows up here.</p></Card>
      )}
      <div className="space-y-2">
        {data?.items.map((n) => {
          const isNew = since ? new Date(n.at) > new Date(since) : false;
          return (
            <Card key={n.id} className={`flex items-start gap-3 ${isNew ? "border-primary/40 bg-primary/5" : ""}`}>
              <div className="text-2xl leading-none">{n.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{n.title}</span>
                  {isNew && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold uppercase text-primary-fg">New</span>}
                </div>
                <p className="truncate text-sm text-muted">{n.body}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{ago(n.at)}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
