import { type CurrentActivity, useActivityAction, useChecklistReset, useChecklistToggle } from "../../lib/sessions";
import { timeAgo } from "../../lib/tasks";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

// Checklist / protocol run-through — the room ticks items off together; each tick records who did it.
// Works for runbooks, pre-op safety checks, month-end close, audits, etc.
export function ChecklistView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const c = activity.checklist!;
  const toggle = useChecklistToggle(sessionId, activity.id);
  const reset = useChecklistReset(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const allDone = c.total > 0 && c.done === c.total;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">✅ {activity.title}</h2>
          <p className="text-xs text-muted">{c.done} of {c.total} done</p>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-border/60">
        <div className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {allDone && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700">✓ All items complete</div>}

      <ul className="space-y-1">
        {c.items.map((item) => (
          <li key={item.index}>
            <button onClick={() => toggle.mutate(item.index)} className="flex w-full items-start gap-2 rounded-lg border border-border p-2 text-left hover:bg-border/30">
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs", item.checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent")}>✓</span>
              <span className="min-w-0 flex-1">
                <span className={cn("text-sm", item.checked ? "text-muted line-through" : "text-fg")}>{item.label}</span>
                {item.checked && item.byName && <span className="block text-[11px] text-muted">✓ {item.byName}{item.at ? ` · ${timeAgo(item.at)}` : ""}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {canControl && c.done > 0 && (
        <button onClick={() => reset.mutate()} className="mt-3 text-xs text-muted hover:text-primary">↺ Reset all (re-run)</button>
      )}
    </Card>
  );
}
