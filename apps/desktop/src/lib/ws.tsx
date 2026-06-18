import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { playNotify } from "./prefs";

// One WebSocket while logged in. On every event we refresh the affected queries —
// which also resyncs state after a reconnect (the simple, robust integration).
// Components that want the raw event (e.g. the invite popup) listen for "ces-rt".
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/api/ws`);
      socket.onmessage = (e) => {
        const event = JSON.parse(e.data);
        // Pull back someone whose window isn't focused when they're invited into a session.
        if (event.type === "session.invite" && !document.hasFocus()) playNotify();
        qc.invalidateQueries({ queryKey: ["me-invites"] });
        if (event.boardId) {
          qc.invalidateQueries({ queryKey: ["board", event.boardId] });
          qc.invalidateQueries({ queryKey: ["boards"] });
        }
        if (event.sessionId) {
          qc.invalidateQueries({ queryKey: ["session", event.sessionId] });
          qc.invalidateQueries({ queryKey: ["messages", event.sessionId] });
          qc.invalidateQueries({ queryKey: ["artifacts", event.sessionId] });
          qc.invalidateQueries({ queryKey: ["idea-comments"] }); // refresh any open comment thread
        }
        window.dispatchEvent(new CustomEvent("ces-rt", { detail: event }));
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500); // reconnect; the refetch resyncs
      };
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [enabled, qc]);
}
