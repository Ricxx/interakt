import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { auditLog, users } from "../../db/schema.js";
import { requireRole } from "../../auth.js";
import { auditHash } from "../../lib/audit.js";

const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };

export function auditRoutes(app: FastifyInstance) {
  // The audit trail, newest first. `before` is an id cursor for paging.
  app.get<{ Querystring: { limit?: string; before?: string } }>("/api/audit", adminOnly, async (req) => {
    const tenantId = req.currentUser!.tenantId;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const conds = [eq(auditLog.tenantId, tenantId)];
    if (req.query.before) conds.push(lt(auditLog.id, Number(req.query.before)));
    const rows = await db
      .select({ id: auditLog.id, action: auditLog.action, meta: auditLog.meta, createdAt: auditLog.createdAt, actorName: users.displayName })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(...conds))
      .orderBy(desc(auditLog.id))
      .limit(limit);
    return { entries: rows.map((r) => ({ id: r.id, action: r.action, meta: r.meta, at: r.createdAt.toISOString(), actorName: r.actorName ?? "system" })) };
  });

  // Full export for records/compliance (admin).
  app.get("/api/audit/export", adminOnly, async (req, reply) => {
    const rows = await db
      .select({ id: auditLog.id, action: auditLog.action, meta: auditLog.meta, createdAt: auditLog.createdAt, hash: auditLog.hash, actorName: users.displayName })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(eq(auditLog.tenantId, req.currentUser!.tenantId))
      .orderBy(asc(auditLog.id));
    const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = ["id,time,actor,action,detail,hash", ...rows.map((r) => [r.id, r.createdAt.toISOString(), cell(r.actorName ?? "system"), cell(r.action), cell(r.meta ? JSON.stringify(r.meta) : ""), r.hash].join(","))];
    return reply.header("content-type", "text/csv").header("content-disposition", 'attachment; filename="audit-log.csv"').send(lines.join("\n"));
  });

  // Tamper check: recompute the hash chain and report the first break (if any).
  // The chain is global (across tenants), so verify the whole thing — that's the point.
  app.get("/api/audit/verify", adminOnly, async () => {
    const rows = await db.select({ id: auditLog.id, action: auditLog.action, tenantId: auditLog.tenantId, actorId: auditLog.actorId, meta: auditLog.meta, prevHash: auditLog.prevHash, hash: auditLog.hash }).from(auditLog).orderBy(asc(auditLog.id));
    let prev: string | null = null;
    for (const r of rows) {
      const expected = auditHash(prev, { action: r.action, tenantId: r.tenantId, actorId: r.actorId, meta: (r.meta as Record<string, unknown> | null) ?? null });
      if (r.prevHash !== prev || r.hash !== expected) return { ok: false, count: rows.length, brokenAtId: r.id };
      prev = r.hash;
    }
    return { ok: true, count: rows.length };
  });
}
