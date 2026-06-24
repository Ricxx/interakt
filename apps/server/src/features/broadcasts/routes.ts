import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { broadcasts, broadcastAcks, users, orgNodes } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { can, hasScope } from "../../lib/capabilities.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";

type Me = { id: string; tenantId: string; role: string; nodeId?: string | null };

// Broadcasts — leadership announcements with optional acknowledgement tracking. Anyone in scope
// reads; sending/measuring reuses the scoped broadcast.send capability (ALL → ORG reach, NODE →
// that department's reach). Senders see reach (how many recipients acknowledged).
export function broadcastRoutes(app: FastifyInstance) {
  async function canSend(me: Me, scopeKind: string, scopeId: string | null) {
    if (scopeKind === "ALL") return hasScope(me, "broadcast.send", "ORG");
    return can(me, "broadcast.send", scopeId ?? undefined);
  }
  const canSee = (me: Me, scopeKind: string, scopeId: string | null) =>
    canSeeScoped({ tenantId: me.tenantId, scopeKind, scopeId }, me.id, me.tenantId);

  // How many active people a broadcast reaches (the denominator for ack %).
  async function recipientCount(me: Me, scopeKind: string, scopeId: string | null): Promise<number> {
    if (scopeKind === "ALL") {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.tenantId, me.tenantId), eq(users.status, "ACTIVE")));
      return r?.n ?? 0;
    }
    if (!scopeId) return 0;
    const [target] = await db.select({ path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.id, scopeId));
    if (!target) return 0;
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(orgNodes, eq(users.nodeId, orgNodes.id))
      .where(and(eq(users.tenantId, me.tenantId), eq(users.status, "ACTIVE"), sql`(${orgNodes.path} = ${target.path} or ${orgNodes.path} like ${target.path + ".%"})`));
    return r?.n ?? 0;
  }

  app.get("/api/broadcasts", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(broadcasts).where(eq(broadcasts.tenantId, me.tenantId)).orderBy(desc(broadcasts.createdAt));
    const myAcks = new Set((await db.select({ b: broadcastAcks.broadcastId }).from(broadcastAcks).where(eq(broadcastAcks.userId, me.id))).map((r) => r.b));
    const out = [];
    for (const b of rows) {
      if (!(await canSee(me, b.scopeKind, b.scopeId))) continue;
      const manage = await canSend(me, b.scopeKind, b.scopeId);
      let stats: { recipients: number; acked: number } | undefined;
      if (manage) {
        const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(broadcastAcks).where(eq(broadcastAcks.broadcastId, b.id));
        stats = { recipients: await recipientCount(me, b.scopeKind, b.scopeId), acked: a?.n ?? 0 };
      }
      out.push({ id: b.id, title: b.title, body: b.body, scope: await scopeLabel(me.tenantId, b.scopeKind, b.scopeId), requireAck: b.requireAck, createdAt: b.createdAt.toISOString(), acked: myAcks.has(b.id), canManage: manage, stats });
    }
    return { items: out, canSendOrg: await hasScope(me, "broadcast.send", "ORG") };
  });

  // Nav badge: announcements that require my acknowledgement and I haven't acked yet.
  app.get("/api/broadcasts/pending", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(broadcasts).where(and(eq(broadcasts.tenantId, me.tenantId), eq(broadcasts.requireAck, true))).orderBy(desc(broadcasts.createdAt)).limit(200);
    const myAcks = new Set((await db.select({ b: broadcastAcks.broadcastId }).from(broadcastAcks).where(eq(broadcastAcks.userId, me.id))).map((r) => r.b));
    let count = 0;
    for (const b of rows) if (!myAcks.has(b.id) && (await canSee(me, b.scopeKind, b.scopeId))) count++;
    return { count };
  });

  app.post("/api/broadcasts", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ scopeKind: z.enum(["ALL", "NODE"]), scopeId: z.string().uuid().nullable().optional(), title: z.string().trim().min(2).max(200), body: z.string().trim().min(2).max(4000), requireAck: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const d = body.data;
    if (d.scopeKind === "NODE" && !d.scopeId) return reply.code(400).send({ error: "scope_required" });
    if (!(await canSend(me, d.scopeKind, d.scopeId ?? null))) return reply.code(403).send({ error: "forbidden" });
    const [row] = await db.insert(broadcasts).values({ tenantId: me.tenantId, scopeKind: d.scopeKind, scopeId: d.scopeId ?? null, title: d.title, body: d.body, requireAck: d.requireAck ?? false, createdBy: me.id }).returning({ id: broadcasts.id });
    await recordAudit({ action: "broadcast.sent", tenantId: me.tenantId, actorId: me.id, meta: { id: row.id, scopeKind: d.scopeKind, scopeId: d.scopeId ?? null, requireAck: d.requireAck ?? false } });
    return { id: row.id };
  });

  app.post("/api/broadcasts/:id/ack", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const [b] = await db.select().from(broadcasts).where(and(eq(broadcasts.id, (req.params as { id: string }).id), eq(broadcasts.tenantId, me.tenantId)));
    if (!b) return reply.code(404).send({ error: "not_found" });
    if (!(await canSee(me, b.scopeKind, b.scopeId))) return reply.code(403).send({ error: "forbidden" });
    await db.insert(broadcastAcks).values({ broadcastId: b.id, userId: me.id }).onConflictDoNothing();
    return { ok: true };
  });

  app.delete("/api/broadcasts/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const [b] = await db.select().from(broadcasts).where(and(eq(broadcasts.id, (req.params as { id: string }).id), eq(broadcasts.tenantId, me.tenantId)));
    if (!b) return reply.code(404).send({ error: "not_found" });
    if (!(await canSend(me, b.scopeKind, b.scopeId))) return reply.code(403).send({ error: "forbidden" });
    await db.delete(broadcastAcks).where(eq(broadcastAcks.broadcastId, b.id));
    await db.delete(broadcasts).where(eq(broadcasts.id, b.id));
    await recordAudit({ action: "broadcast.deleted", tenantId: me.tenantId, actorId: me.id, meta: { id: b.id } });
    return { ok: true };
  });
}
