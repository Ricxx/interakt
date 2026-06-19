import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, like } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orgNodes, users, auditLog } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { createOrgNode } from "../../lib/org.js";
import { seedDemoData } from "../../lib/demoData.js";
import { recordAudit } from "../../lib/audit.js";

const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };
const createBody = z.object({
  name: z.string().min(1).max(120),
  nodeType: z.string().trim().min(1).max(40), // free-form level label — companies name their own tiers
  parentId: z.string().uuid().nullable(),
});

export function orgRoutes(app: FastifyInstance) {
  // The org tree for the logged-in user's company (dashboard + scope pickers + the management view).
  // memberCount is the people whose home node is exactly this node (shared with member management).
  app.get("/api/org/nodes", { preHandler: requireAuth }, async (req) => {
    const tenantId = req.currentUser!.tenantId;
    const nodes = await db
      .select({ id: orgNodes.id, name: orgNodes.name, nodeType: orgNodes.nodeType, path: orgNodes.path, parentId: orgNodes.parentId })
      .from(orgNodes)
      .where(eq(orgNodes.tenantId, tenantId))
      .orderBy(orgNodes.path);
    const counts = new Map<string, number>();
    for (const r of await db.select({ nodeId: users.nodeId, c: count() }).from(users).where(eq(users.tenantId, tenantId)).groupBy(users.nodeId)) if (r.nodeId) counts.set(r.nodeId, Number(r.c));
    return { nodes: nodes.map((n) => ({ ...n, memberCount: counts.get(n.id) ?? 0 })) };
  });

  // Admin: rename a node and/or move it under a new parent. Names are display-only (path uses random
  // segments, so renaming never affects scope). Moving rewrites the path prefix of the node + its whole
  // subtree (scoped visibility keys off path), and is blocked if it would create a cycle.
  app.patch<{ Params: { id: string } }>("/api/org/nodes/:id", adminOnly, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), nodeType: z.string().trim().min(1).max(40).optional(), parentId: z.string().uuid().nullable().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const tenantId = req.currentUser!.tenantId;
    const all = await db.select({ id: orgNodes.id, path: orgNodes.path, parentId: orgNodes.parentId }).from(orgNodes).where(eq(orgNodes.tenantId, tenantId));
    const node = all.find((n) => n.id === req.params.id);
    if (!node) return reply.code(404).send({ error: "not_found" });

    if (body.data.name !== undefined || body.data.nodeType !== undefined) {
      const set: Record<string, string> = {};
      if (body.data.name !== undefined) set.name = body.data.name;
      if (body.data.nodeType !== undefined) set.nodeType = body.data.nodeType;
      await db.update(orgNodes).set(set).where(eq(orgNodes.id, node.id));
      await recordAudit({ action: "org.node_renamed", tenantId, actorId: req.currentUser!.id, meta: { nodeId: node.id, ...set } });
    }

    if (body.data.parentId !== undefined && body.data.parentId !== node.parentId) {
      const newParentId = body.data.parentId;
      let parentPath: string | null = null;
      if (newParentId) {
        const parent = all.find((n) => n.id === newParentId);
        if (!parent) return reply.code(400).send({ error: "invalid_parent" });
        // No cycles: the new parent can't be the node itself or anything in its subtree.
        if (parent.path === node.path || parent.path.startsWith(`${node.path}.`)) return reply.code(400).send({ error: "cycle" });
        parentPath = parent.path;
      }
      const ownSeg = node.path.split(".").pop()!;
      const newPath = parentPath ? `${parentPath}.${ownSeg}` : ownSeg;
      // Rewrite this node + every descendant (path === old or starts with "old.").
      for (const n of all) {
        if (n.path === node.path || n.path.startsWith(`${node.path}.`)) {
          await db.update(orgNodes).set({ path: newPath + n.path.slice(node.path.length) }).where(eq(orgNodes.id, n.id));
        }
      }
      await db.update(orgNodes).set({ parentId: newParentId }).where(eq(orgNodes.id, node.id));
      await recordAudit({ action: "org.node_moved", tenantId, actorId: req.currentUser!.id, meta: { nodeId: node.id, parentId: newParentId } });
    }
    return { ok: true };
  });

  // Admin: the recent org change log (create/rename/move/delete), with who did it.
  app.get("/api/org/log", adminOnly, async (req) => {
    const rows = await db
      .select({ id: auditLog.id, action: auditLog.action, meta: auditLog.meta, createdAt: auditLog.createdAt, actorName: users.displayName })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.tenantId, req.currentUser!.tenantId), like(auditLog.action, "org.node_%")))
      .orderBy(desc(auditLog.id))
      .limit(50);
    return { log: rows.map((r) => ({ action: r.action, meta: r.meta, actorName: r.actorName, createdAt: r.createdAt.toISOString() })) };
  });

  // Admin: add a division/department/unit/team.
  app.post("/api/org/nodes", adminOnly, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    try {
      const node = await createOrgNode(req.currentUser!.tenantId, parsed.data);
      await recordAudit({ action: "org.node_created", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { nodeId: node.id, name: node.name, nodeType: parsed.data.nodeType } });
      return { node: { id: node.id, name: node.name } };
    } catch {
      return reply.code(400).send({ error: "invalid_parent" });
    }
  });

  // Admin: delete a node only if nothing depends on it (no children, no people).
  app.delete<{ Params: { id: string } }>("/api/org/nodes/:id", adminOnly, async (req, reply) => {
    const tenantId = req.currentUser!.tenantId;
    const [node] = await db
      .select({ id: orgNodes.id })
      .from(orgNodes)
      .where(and(eq(orgNodes.id, req.params.id), eq(orgNodes.tenantId, tenantId)));
    if (!node) return reply.code(404).send({ error: "not_found" });

    const [child] = await db.select({ id: orgNodes.id }).from(orgNodes).where(eq(orgNodes.parentId, node.id)).limit(1);
    const [member] = await db.select({ id: users.id }).from(users).where(eq(users.nodeId, node.id)).limit(1);
    if (child || member) return reply.code(409).send({ error: "not_empty" });

    await db.delete(orgNodes).where(eq(orgNodes.id, node.id));
    await recordAudit({ action: "org.node_deleted", tenantId, actorId: req.currentUser!.id, meta: { nodeId: node.id } });
    return { ok: true };
  });

  // Admin: load demo data — only into an empty org (testing/onboarding aid).
  app.post("/api/org/demo", adminOnly, async (req, reply) => {
    const tenantId = req.currentUser!.tenantId;
    const [existing] = await db.select({ id: orgNodes.id }).from(orgNodes).where(eq(orgNodes.tenantId, tenantId)).limit(1);
    if (existing) return reply.code(409).send({ error: "org_not_empty" });
    const result = await seedDemoData(tenantId);
    return result;
  });
}
