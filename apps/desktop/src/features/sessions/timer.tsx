import { useEffect, useState } from "react";
import { type CurrentActivity, useActivityAction, useTimerAction } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

const DURATIONS: { label: string; secs: number }[] = [
  { label: "1m", secs: 60 }, { label: "2m", secs: 120 }, { label: "5m", secs: 300 },
  { label: "10m", secs: 600 }, { label: "15m", secs: 900 }, { label: "30m", secs: 1800 },
];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Meeting timer / timeboxer — host runs a countdown for a topic or speaker; the whole room sees it.
// The remaining time is computed locally from `endsAt`, so it ticks smoothly with no server polling.
export function TimerView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const t = activity.timer!;
  const act = useTimerAction(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const [dur, setDur] = useState(t.seconds);

  // Local tick: re-render 4×/sec while running so the countdown is smooth.
  const [, force] = useState(0);
  useEffect(() => {
    if (!t.running) return;
    const iv = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, [t.running, t.endsAt]);

  const remaining = t.running && t.endsAt ? Math.max(0, Math.round((new Date(t.endsAt).getTime() - Date.now()) / 1000)) : t.pausedRemaining ?? t.seconds;
  const idle = !t.running && t.pausedRemaining == null;
  const expired = t.running && remaining === 0;
  const danger = remaining <= 10 && !idle;

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">⏱️ {activity.title}</h2>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className="py-4 text-center">
        <div className={cn("text-6xl font-bold tabular-nums", expired ? "text-red-600" : danger ? "text-amber-600" : "text-fg")}>{fmt(remaining)}</div>
        {expired && <div className="mt-1 text-sm font-medium text-red-600">⏰ Time's up</div>}
        {t.pausedRemaining != null && <div className="mt-1 text-xs text-muted">paused</div>}
      </div>

      {canControl && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {idle && (
            <>
              <select value={dur} onChange={(e) => setDur(Number(e.target.value))} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
                {DURATIONS.map((d) => <option key={d.secs} value={d.secs}>{d.label}</option>)}
              </select>
              <Button onClick={() => act.mutate({ action: "start", seconds: dur })}>Start</Button>
            </>
          )}
          {t.running && (
            <>
              <Button variant="subtle" onClick={() => act.mutate({ action: "pause" })}>Pause</Button>
              <Button variant="subtle" onClick={() => act.mutate({ action: "start", seconds: dur })}>Restart</Button>
              <button onClick={() => act.mutate({ action: "reset" })} className="text-xs text-muted hover:text-fg">Reset</button>
            </>
          )}
          {t.pausedRemaining != null && (
            <>
              <Button onClick={() => act.mutate({ action: "resume" })}>Resume</Button>
              <button onClick={() => act.mutate({ action: "reset" })} className="text-xs text-muted hover:text-fg">Reset</button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
