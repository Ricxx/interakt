import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, gt, lt, desc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { agendaItems, sessionParticipants, sessions } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { canRunActivities } from "../../lib/sessionControl.js";
import { hub } from "../../lib/realtime.js";

async function notifyRoom(sessionId: string) {
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  const parts = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  const targets = new Set(parts.map((p) => p.userId));
  if (s) targets.add(s.hostId);
  hub.sendToUsers([...targets], { type: "session.update", sessionId });
}

// Load the session if the caller can run activities (host/co-host/activity-admin manage the agenda).
async function controllable(sessionId: string, userId: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s) return null;
  return (await canRunActivities(sessionId, userId)) ? s : null;
}

export function agendaRoutes(app: FastifyInstance) {
  const itemBody = z.object({
    title: z.string().min(1).max(200),
    time: z.string().max(20).nullish(),
    durationMins: z.number().int().min(0).max(1440).nullish(),
    note: z.string().max(500).nullish(),
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/agenda", { preHandler: requireAuth }, async (req, reply) => {
    const body = itemBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const s = await controllable(req.params.id, req.currentUser!.id);
    if (!s) return reply.code(403).send({ error: "not_allowed" });
    const [last] = await db.select({ position: agendaItems.position }).from(agendaItems).where(eq(agendaItems.sessionId, s.id)).orderBy(desc(agendaItems.position)).limit(1);
    await db.insert(agendaItems).values({ sessionId: s.id, title: body.data.title, time: body.data.time ?? null, durationMins: body.data.durationMins ?? null, note: body.data.note ?? null, position: (last?.position ?? 0) + 1 });
    await notifyRoom(s.id);
    return { ok: true };
  });

  app.patch<{ Params: { id: string; itemId: string } }>("/api/sessions/:id/agenda/:itemId", { preHandler: requireAuth }, async (req, reply) => {
    const body = itemBody.partial().extend({ done: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const s = await controllable(req.params.id, req.currentUser!.id);
    if (!s) return reply.code(403).send({ error: "not_allowed" });
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "time", "durationMins", "note", "done"] as const) if (body.data[k] !== undefined) patch[k] = body.data[k];
    if (Object.keys(patch).length) await db.update(agendaItems).set(patch).where(and(eq(agendaItems.id, req.params.itemId), eq(agendaItems.sessionId, s.id)));
    await notifyRoom(s.id);
    return { ok: true };
  });

  // Set the active item (or clear it by activating the one that's already active).
  app.post<{ Params: { id: string; itemId: string } }>("/api/sessions/:id/agenda/:itemId/activate", { preHandler: requireAuth }, async (req, reply) => {
    const s = await controllable(req.params.id, req.currentUser!.id);
    if (!s) return reply.code(403).send({ error: "not_allowed" });
    const next = s.activeAgendaId === req.params.itemId ? null : req.params.itemId;
    await db.update(sessions).set({ activeAgendaId: next }).where(eq(sessions.id, s.id));
    await notifyRoom(s.id);
    return { ok: true };
  });

  // Reorder by swapping position with the previous/next item.
  app.post<{ Params: { id: string; itemId: string } }>("/api/sessions/:id/agenda/:itemId/move", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ dir: z.enum(["up", "down"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const s = await controllable(req.params.id, req.currentUser!.id);
    if (!s) return reply.code(403).send({ error: "not_allowed" });
    const [item] = await db.select().from(agendaItems).where(and(eq(agendaItems.id, req.params.itemId), eq(agendaItems.sessionId, s.id)));
    if (!item) return reply.code(404).send({ error: "not_found" });
    const cmp = body.data.dir === "up" ? lt(agendaItems.position, item.position) : gt(agendaItems.position, item.position);
    const [neighbor] = await db
      .select()
      .from(agendaItems)
      .where(and(eq(agendaItems.sessionId, s.id), cmp))
      .orderBy(body.data.dir === "up" ? desc(agendaItems.position) : asc(agendaItems.position))
      .limit(1);
    if (neighbor) {
      await db.update(agendaItems).set({ position: neighbor.position }).where(eq(agendaItems.id, item.id));
      await db.update(agendaItems).set({ position: item.position }).where(eq(agendaItems.id, neighbor.id));
      await notifyRoom(s.id);
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string; itemId: string } }>("/api/sessions/:id/agenda/:itemId", { preHandler: requireAuth }, async (req, reply) => {
    const s = await controllable(req.params.id, req.currentUser!.id);
    if (!s) return reply.code(403).send({ error: "not_allowed" });
    await db.delete(agendaItems).where(and(eq(agendaItems.id, req.params.itemId), eq(agendaItems.sessionId, s.id)));
    if (s.activeAgendaId === req.params.itemId) await db.update(sessions).set({ activeAgendaId: null }).where(eq(sessions.id, s.id));
    await notifyRoom(s.id);
    return { ok: true };
  });
}
