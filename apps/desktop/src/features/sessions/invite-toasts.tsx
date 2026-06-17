import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDeclineSession, useJoinSession, useMeInvites } from "../../lib/sessions";
import { Button } from "../../ui/button";

// Floating invite popups. Each shows for 30s, then auto-dismisses (the invite still
// lives on the dashboard for recovery). Driven by the invite list, refreshed over WS.
export function InviteToasts() {
  const { data } = useMeInvites();
  const join = useJoinSession();
  const decline = useDeclineSession();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const invited = (data?.invites ?? []).filter((i) => i.myState === "INVITED" && !dismissed.has(i.id));

  // A fresh invite (incl. remind / re-invite) for a session should re-show its popup,
  // even if it was auto-dismissed earlier. Un-dismiss + reset its timer on the event.
  useEffect(() => {
    function onRt(e: Event) {
      const ev = (e as CustomEvent).detail;
      if (ev?.type !== "session.invite" || !ev.sessionId) return;
      setDismissed((prev) => {
        if (!prev.has(ev.sessionId)) return prev;
        const next = new Set(prev);
        next.delete(ev.sessionId);
        return next;
      });
      const t = timers.current.get(ev.sessionId);
      if (t) {
        clearTimeout(t);
        timers.current.delete(ev.sessionId);
      }
    }
    window.addEventListener("ces-rt", onRt);
    return () => window.removeEventListener("ces-rt", onRt);
  }, []);

  // Start a 15s auto-dismiss timer the first time each invite appears.
  useEffect(() => {
    for (const inv of invited) {
      if (!timers.current.has(inv.id)) {
        timers.current.set(
          inv.id,
          setTimeout(() => setDismissed((prev) => new Set(prev).add(inv.id)), 30000),
        );
      }
    }
  });

  if (invited.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3">
      {invited.map((inv) => (
        <div key={inv.id} className="w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {/* 15s countdown bar */}
          <div className="h-1 bg-border/40">
            <div className="h-full origin-left bg-primary" style={{ animation: "ces-shrink 30s linear forwards" }} />
          </div>
          <div className="p-4">
            <div className="text-sm font-semibold">{inv.title}</div>
            <div className="mb-3 text-xs text-muted">{inv.hostName} invited you to join.</div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setDismissed((prev) => new Set(prev).add(inv.id)); // hide instantly
                  join.mutate(inv.id, { onSettled: () => navigate(`/sessions/${inv.id}`) });
                }}
              >
                Join
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setDismissed((prev) => new Set(prev).add(inv.id));
                  decline.mutate(inv.id);
                }}
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
