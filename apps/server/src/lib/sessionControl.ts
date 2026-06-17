import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, sessionParticipants } from "../db/schema.js";

async function sessionRoleOf(sessionId: string, userId: string): Promise<"HOST" | "COHOST" | "ACTIVITY_ADMIN" | null> {
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  if (!s) return null;
  if (s.hostId === userId) return "HOST";
  const [p] = await db
    .select({ role: sessionParticipants.sessionRole })
    .from(sessionParticipants)
    .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId)));
  return p?.role === "COHOST" ? "COHOST" : p?.role === "ACTIVITY_ADMIN" ? "ACTIVITY_ADMIN" : null;
}

// Meeting control: the host and co-hosts. Used for invite/remove/settings/end.
export async function canControlSession(sessionId: string, userId: string): Promise<boolean> {
  const r = await sessionRoleOf(sessionId, userId);
  return r === "HOST" || r === "COHOST";
}

// Activity control: host, co-hosts, and appointed activity admins (launch/drive/monitor activities).
export async function canRunActivities(sessionId: string, userId: string): Promise<boolean> {
  const r = await sessionRoleOf(sessionId, userId);
  return r === "HOST" || r === "COHOST" || r === "ACTIVITY_ADMIN";
}

// In the room = host or a JOINED participant (can chat, add brainstorm ideas, etc.).
export async function isInRoom(sessionId: string, userId: string): Promise<boolean> {
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  if (!s) return false;
  if (s.hostId === userId) return true;
  const [p] = await db
    .select({ state: sessionParticipants.state })
    .from(sessionParticipants)
    .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId)));
  return p?.state === "JOINED";
}
