import { Link } from "react-router-dom";
import { taskEventText, timeAgo, useTaskFeed } from "../../lib/tasks";

// Recent task changes ("Bob M. completed MRKT-3 and related MRKT-1 · 2h"). Used on the To-do page and Dashboard.
export function TaskFeed({ limit, seeAll }: { limit?: number; seeAll?: boolean }) {
  const { data, isLoading } = useTaskFeed(limit);
  const events = data?.events ?? [];
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (events.length === 0) return <p className="text-sm text-muted">No task activity yet.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">{taskEventText(e)}</span>
          <span className="shrink-0 text-xs text-muted">{timeAgo(e.at)}</span>
        </li>
      ))}
      {seeAll && (
        <li className="pt-1">
          <Link to="/tasks" className="text-xs text-primary hover:underline">See all →</Link>
        </li>
      )}
    </ul>
  );
}
