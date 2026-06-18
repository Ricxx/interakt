import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { sessionArtifacts, sessionParticipants, sessions, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { canRunActivities, isInRoom } from "../../lib/sessionControl.js";
import { hub } from "../../lib/realtime.js";

async function notifyRoom(sessionId: string) {
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  const parts = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  const targets = new Set(parts.map((p) => p.userId));
  if (s) targets.add(s.hostId);
  hub.sendToUsers([...targets], { type: "session.update", sessionId });
}

// LINK by default; recognise YouTube as a video and common image URLs as images.
function detectKind(url: string): "VIDEO" | "IMAGE" | "LINK" {
  if (/(youtube\.com\/watch|youtu\.be\/)/i.test(url)) return "VIDEO";
  if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(url)) return "IMAGE";
  return "LINK";
}

const addBody = z
  .object({
    url: z.string().url().max(2000).optional(),
    data: z.string().min(1).max(20000).optional(), // pasted CSV/TSV for a DATA artifact
    chartType: z.enum(["BAR", "LINE", "DONUT"]).optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .refine((b) => (b.url && /^https?:\/\//i.test(b.url)) || b.data, "url (http/s) or data required");

export function artifactRoutes(app: FastifyInstance) {
  // Anyone in the room can see the resources.
  app.get<{ Params: { id: string } }>("/api/sessions/:id/artifacts", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    if (!(await isInRoom(req.params.id, me.id))) return reply.code(403).send({ error: "not_in_room" });
    const rows = await db
      .select({ id: sessionArtifacts.id, kind: sessionArtifacts.kind, title: sessionArtifacts.title, url: sessionArtifacts.url, data: sessionArtifacts.data, chartType: sessionArtifacts.chartType, addedBy: sessionArtifacts.addedBy, byName: users.displayName, createdAt: sessionArtifacts.createdAt })
      .from(sessionArtifacts)
      .innerJoin(users, eq(users.id, sessionArtifacts.addedBy))
      .where(eq(sessionArtifacts.sessionId, req.params.id))
      .orderBy(asc(sessionArtifacts.createdAt));
    return { artifacts: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, data: r.data, chartType: r.chartType, byName: r.byName, mine: r.addedBy === me.id, createdAt: r.createdAt.toISOString() })) };
  });

  // Anyone in the room can drop a resource (collaborative).
  app.post<{ Params: { id: string } }>("/api/sessions/:id/artifacts", { preHandler: requireAuth }, async (req, reply) => {
    const body = addBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    if (!(await isInRoom(req.params.id, me.id))) return reply.code(403).send({ error: "not_in_room" });
    if (body.data.data) {
      await db.insert(sessionArtifacts).values({ sessionId: req.params.id, kind: "DATA", title: body.data.title?.trim() || "Data", data: body.data.data, chartType: body.data.chartType ?? "BAR", addedBy: me.id });
    } else {
      const url = body.data.url!;
      await db.insert(sessionArtifacts).values({ sessionId: req.params.id, kind: detectKind(url), title: body.data.title?.trim() || url, url, addedBy: me.id });
    }
    await notifyRoom(req.params.id);
    return { ok: true };
  });

  // The person who added it, or a host/co-host, can remove it.
  app.delete<{ Params: { id: string; artifactId: string } }>("/api/sessions/:id/artifacts/:artifactId", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [a] = await db.select().from(sessionArtifacts).where(and(eq(sessionArtifacts.id, req.params.artifactId), eq(sessionArtifacts.sessionId, req.params.id)));
    if (!a) return reply.code(404).send({ error: "not_found" });
    if (a.addedBy !== me.id && !(await canRunActivities(req.params.id, me.id))) return reply.code(403).send({ error: "not_allowed" });
    await db.delete(sessionArtifacts).where(eq(sessionArtifacts.id, a.id));
    await notifyRoom(req.params.id);
    return { ok: true };
  });
}
