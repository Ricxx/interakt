import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { sessions, sessionParticipants } from "../../db/schema.js";
import { hub } from "../../lib/realtime.js";

// Host-disconnect retention. When the host's connection drops we wait a grace period;
// if they don't return AND there's a co-host, we pass host to a co-host. With no
// co-host we keep the session as-is for the host to reconnect (never auto-pass).
const GRACE_MS = 30_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function onUserConnected(userId: string): Promise<void> {
  // Host (or about-to-fail host) reconnected — cancel any pending failover.
  const hosted = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.hostId, userId), eq(sessions.state, "LIVE")));
  for (const s of hosted) {
    const t = timers.get(s.id);
    if (t) {
      clearTimeout(t);
      timers.delete(s.id);
    }
  }
}

export async function onUserDisconnected(userId: string): Promise<void> {
  if (hub.isOnline(userId)) return; // still has another tab/device open
  const hosted = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.hostId, userId), eq(sessions.state, "LIVE")));
  for (const s of hosted) {
    if (timers.has(s.id)) continue;
    timers.set(s.id, setTimeout(() => void failover(s.id, userId), GRACE_MS));
  }
}

async function failover(sessionId: string, originalHostId: string): Promise<void> {
  timers.delete(sessionId);
  if (hub.isOnline(originalHostId)) return; // came back in time
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s || s.state !== "LIVE" || s.hostId !== originalHostId) return; // changed meanwhile

  const cohosts = await db
    .select({ userId: sessionParticipants.userId })
    .from(sessionParticipants)
    .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.sessionRole, "COHOST"), eq(sessionParticipants.state, "JOINED")));
  if (cohosts.length === 0) return; // no co-host → keep the session; host can reconnect

  const next = cohosts.find((c) => hub.isOnline(c.userId)) ?? cohosts[0];
  await db.update(sessions).set({ hostId: next.userId }).where(eq(sessions.id, sessionId));
  await db.update(sessionParticipants).set({ sessionRole: null }).where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, next.userId)));
  // Old host becomes a co-host so they can act / the creator can reclaim later.
  await db
    .insert(sessionParticipants)
    .values({ sessionId, userId: originalHostId, state: "JOINED", sessionRole: "COHOST", respondedAt: new Date() })
    .onConflictDoUpdate({ target: [sessionParticipants.sessionId, sessionParticipants.userId], set: { state: "JOINED", sessionRole: "COHOST" } });

  const parts = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  hub.sendToUsers([...new Set([...parts.map((p) => p.userId), next.userId])], { type: "session.update", sessionId });
}
