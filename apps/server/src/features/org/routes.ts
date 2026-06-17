import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orgNodes, users } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { createOrgNode } from "../../lib/org.js";
import { seedDemoData } from "../../lib/demoData.js";
import { recordAudit } from "../../lib/audit.js";

const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };
const createBody = z.object({
  name: z.string().min(1).max(120),
  nodeType: z.enum(["DIVISION", "DEPARTMENT", "UNIT", "TEAM"]),
  parentId: z.string().uuid().nullable(),
});

export function orgRoutes(app: FastifyInstance) {
  // The org tree for the logged-in user's company (dashboard + scope pickers).
  app.get("/api/org/nodes", { preHandler: requireAuth }, async (req) => {
    const nodes = await db
      .select({ id: orgNodes.id, name: orgNodes.name, nodeType: orgNodes.nodeType, path: orgNodes.path, parentId: orgNodes.parentId })
      .from(orgNodes)
      .where(eq(orgNodes.tenantId, req.currentUser!.tenantId))
      .orderBy(orgNodes.path);
    return { nodes };
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
