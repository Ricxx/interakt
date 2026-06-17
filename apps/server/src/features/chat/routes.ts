import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { sessions, sessionMessages, sessionParticipants, chatReactions, sessionChatReads, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { hub } from "../../lib/realtime.js";
import { isInRoom as inRoom } from "../../lib/sessionControl.js";

async function notifyChat(sessionId: string) {
  const parts = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  const targets = new Set(parts.map((p) => p.userId));
  if (s) targets.add(s.hostId);
  hub.sendToUsers([...targets], { type: "session.chat", sessionId });
}

export function chatRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/sessions/:id/messages", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    if (!(await inRoom(req.params.id, me))) return reply.code(403).send({ error: "not_in_room" });
    const rows = await db
      .select({ id: sessionMessages.id, userId: sessionMessages.userId, name: users.displayName, body: sessionMessages.body, replyToId: sessionMessages.replyToId, createdAt: sessionMessages.createdAt })
      .from(sessionMessages)
      .innerJoin(users, eq(users.id, sessionMessages.userId))
      .where(eq(sessionMessages.sessionId, req.params.id))
      .orderBy(sessionMessages.createdAt)
      .limit(300);

    const byId = new Map(rows.map((r) => [r.id, r]));
    const ids = rows.map((r) => r.id);
    const reactions = ids.length ? await db.select().from(chatReactions).where(inArray(chatReactions.messageId, ids)) : [];
    const reactByMsg = new Map<string, Map<string, { count: number; mine: boolean }>>();
    for (const r of reactions) {
      const m = reactByMsg.get(r.messageId) ?? new Map();
      const e = m.get(r.emoji) ?? { count: 0, mine: false };
      e.count++;
      if (r.userId === me) e.mine = true;
      m.set(r.emoji, e);
      reactByMsg.set(r.messageId, m);
    }

    const messages = rows.map((r) => {
      const parent = r.replyToId ? byId.get(r.replyToId) : undefined;
      return {
        id: r.id,
        userId: r.userId,
        name: r.name,
        mine: r.userId === me,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        replyTo: parent ? { id: parent.id, name: parent.name, body: parent.body } : null,
        reactions: [...(reactByMsg.get(r.id)?.entries() ?? [])].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })),
      };
    });
    return { messages };
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/messages", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ body: z.string().min(1).max(2000), replyToId: z.string().uuid().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (!(await inRoom(req.params.id, req.currentUser!.id))) return reply.code(403).send({ error: "not_in_room" });
    await db.insert(sessionMessages).values({ sessionId: req.params.id, userId: req.currentUser!.id, body: body.data.body, replyToId: body.data.replyToId ?? null });
    await notifyChat(req.params.id);
    return { ok: true };
  });

  // Toggle an emoji reaction on a message.
  app.post<{ Params: { id: string; msgId: string } }>("/api/sessions/:id/messages/:msgId/react", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ emoji: z.string().min(1).max(8) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!.id;
    if (!(await inRoom(req.params.id, me))) return reply.code(403).send({ error: "not_in_room" });
    const where = and(eq(chatReactions.messageId, req.params.msgId), eq(chatReactions.userId, me), eq(chatReactions.emoji, body.data.emoji));
    const [existing] = await db.select().from(chatReactions).where(where);
    if (existing) await db.delete(chatReactions).where(where);
    else await db.insert(chatReactions).values({ messageId: req.params.msgId, userId: me, emoji: body.data.emoji }).onConflictDoNothing();
    await notifyChat(req.params.id);
    return { ok: true };
  });

  // Mark the chat read (clears the unread badge for this user).
  app.post<{ Params: { id: string } }>("/api/sessions/:id/chat/read", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    if (!(await inRoom(req.params.id, me))) return reply.code(403).send({ error: "not_in_room" });
    await db
      .insert(sessionChatReads)
      .values({ sessionId: req.params.id, userId: me, lastReadAt: new Date() })
      .onConflictDoUpdate({ target: [sessionChatReads.sessionId, sessionChatReads.userId], set: { lastReadAt: new Date() } });
    return { ok: true };
  });
}
