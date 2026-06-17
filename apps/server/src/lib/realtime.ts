import type { WebSocket } from "@fastify/websocket";

// Minimal in-process realtime hub. A user can have several sockets (tabs, the Tauri
// app). We push events to a user by id; "rooms" are resolved from the DB (who is a
// JOINED participant), so the hub itself only needs a user->sockets map.
//
// This is deliberately tiny and single-process — fine to ~2k users. If we ever
// outgrow one box, this is the seam to swap for Centrifugo/Redis (plan §4).

type Conn = { userId: string };
const meta = new Map<WebSocket, Conn>();
const byUser = new Map<string, Set<WebSocket>>();

export type RealtimeEvent = { type: string; [key: string]: unknown };

export const hub = {
  add(socket: WebSocket, userId: string) {
    meta.set(socket, { userId });
    let set = byUser.get(userId);
    if (!set) byUser.set(userId, (set = new Set()));
    set.add(socket);
  },

  // Returns true if the user has no sockets left (fully disconnected).
  remove(socket: WebSocket): boolean {
    const conn = meta.get(socket);
    if (!conn) return false;
    meta.delete(socket);
    const set = byUser.get(conn.userId);
    set?.delete(socket);
    if (set && set.size === 0) {
      byUser.delete(conn.userId);
      return true;
    }
    return false;
  },

  isOnline(userId: string): boolean {
    return (byUser.get(userId)?.size ?? 0) > 0;
  },

  sendToUser(userId: string, event: RealtimeEvent) {
    const set = byUser.get(userId);
    if (!set) return;
    const data = JSON.stringify(event);
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  },

  sendToUsers(userIds: string[], event: RealtimeEvent) {
    for (const id of userIds) this.sendToUser(id, event);
  },
};
