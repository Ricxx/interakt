import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { actionLedger } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { can, hasScope } from "../../lib/capabilities.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";

type Me = { id: string; tenantId: string; role: string; nodeId?: string | null };
const STATUS = ["COMMITTED", "IN_PROGRESS", "DONE"] as const;

// "You said → We did" — the public transparency ledger. Anyone in scope can read; posting/editing
// reuses the same feedback-management reach as the suggestion box (ALL → ORG reach, NODE → that
// department's reach). Edits are audited because it's a privileged, outward-facing commitment.
export function actionRoutes(app: FastifyInstance) {
  async function canManage(me: Me, scopeKind: string, scopeId: string | null) {
    if (scopeKind === "ALL") return hasScope(me, "suggestion.manage", "ORG");
    return can(me, "suggestion.manage", scopeId ?? undefined);
  }
  const canSee = (me: Me, scopeKind: string, scopeId: string | null) =>
    canSeeScoped({ tenantId: me.tenantId, scopeKind, scopeId }, me.id, me.tenantId);

  app.get("/api/actions", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(actionLedger).where(eq(actionLedger.tenantId, me.tenantId)).orderBy(desc(actionLedger.updatedAt));
    const out = [];
    for (const a of rows) {
      if (!(await canSee(me, a.scopeKind, a.scopeId))) continue;
      out.push({ id: a.id, said: a.said, did: a.did, status: a.status, scope: await scopeLabel(me.tenantId, a.scopeKind, a.scopeId), updatedAt: a.updatedAt.toISOString(), canManage: await canManage(me, a.scopeKind, a.scopeId) });
    }
    // Can I post anything at all? (org reach, or node reach somewhere) — drives the "Add" button.
    const canCreateOrg = await hasScope(me, "suggestion.manage", "ORG");
    return { items: out, canCreateOrg };
  });

  app.post("/api/actions", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ scopeKind: z.enum(["ALL", "NODE"]), scopeId: z.string().uuid().nullable().optional(), said: z.string().trim().min(3).max(2000), did: z.string().trim().min(3).max(2000), status: z.enum(STATUS).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const d = body.data;
    if (d.scopeKind === "NODE" && !d.scopeId) return reply.code(400).send({ error: "scope_required" });
    if (!(await canManage(me, d.scopeKind, d.scopeId ?? null))) return reply.code(403).send({ error: "forbidden" });
    const [row] = await db.insert(actionLedger).values({ tenantId: me.tenantId, scopeKind: d.scopeKind, scopeId: d.scopeId ?? null, said: d.said, did: d.did, status: d.status ?? "COMMITTED", createdBy: me.id }).returning({ id: actionLedger.id });
    await recordAudit({ action: "action.created", tenantId: me.tenantId, actorId: me.id, meta: { id: row.id, scopeKind: d.scopeKind, scopeId: d.scopeId ?? null } });
    return { id: row.id };
  });

  app.patch("/api/actions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ said: z.string().trim().min(3).max(2000).optional(), did: z.string().trim().min(3).max(2000).optional(), status: z.enum(STATUS).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [a] = await db.select().from(actionLedger).where(and(eq(actionLedger.id, (req.params as { id: string }).id), eq(actionLedger.tenantId, me.tenantId)));
    if (!a) return reply.code(404).send({ error: "not_found" });
    if (!(await canManage(me, a.scopeKind, a.scopeId))) return reply.code(403).send({ error: "forbidden" });
    const patch = { ...body.data, updatedAt: new Date() };
    await db.update(actionLedger).set(patch).where(eq(actionLedger.id, a.id));
    await recordAudit({ action: "action.updated", tenantId: me.tenantId, actorId: me.id, meta: { id: a.id, ...(body.data.status ? { status: body.data.status } : {}) } });
    return { ok: true };
  });

  app.delete("/api/actions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const [a] = await db.select().from(actionLedger).where(and(eq(actionLedger.id, (req.params as { id: string }).id), eq(actionLedger.tenantId, me.tenantId)));
    if (!a) return reply.code(404).send({ error: "not_found" });
    if (!(await canManage(me, a.scopeKind, a.scopeId))) return reply.code(403).send({ error: "forbidden" });
    await db.delete(actionLedger).where(eq(actionLedger.id, a.id));
    await recordAudit({ action: "action.deleted", tenantId: me.tenantId, actorId: me.id, meta: { id: a.id } });
    return { ok: true };
  });
}
