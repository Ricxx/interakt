import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { groups, groupMembers, users } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";

const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };
const nameBody = z.object({ name: z.string().min(1).max(120) });
const memberBody = z.object({ userId: z.string().uuid() });

export function groupRoutes(app: FastifyInstance) {
  // List groups with their members. Readable by any logged-in user (randomizer scopes).
  app.get("/api/groups", { preHandler: requireAuth }, async (req) => {
    const tenantId = req.currentUser!.tenantId;
    const rows = await db
      .select({
        groupId: groups.id,
        groupName: groups.name,
        userId: users.id,
        userName: users.displayName,
      })
      .from(groups)
      .leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .leftJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groups.tenantId, tenantId))
      .orderBy(groups.name);

    const map = new Map<string, { id: string; name: string; members: { id: string; name: string }[] }>();
    for (const r of rows) {
      if (!map.has(r.groupId)) map.set(r.groupId, { id: r.groupId, name: r.groupName, members: [] });
      if (r.userId) map.get(r.groupId)!.members.push({ id: r.userId, name: r.userName! });
    }
    return { groups: [...map.values()] };
  });

  app.post("/api/groups", adminOnly, async (req, reply) => {
    const parsed = nameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const tenantId = req.currentUser!.tenantId;
    const [g] = await db
      .insert(groups)
      .values({ tenantId, name: parsed.data.name, createdBy: req.currentUser!.id })
      .returning();
    await recordAudit({ action: "group.created", tenantId, actorId: req.currentUser!.id, meta: { name: g.name } });
    return { group: { id: g.id, name: g.name } };
  });

  app.delete<{ Params: { id: string } }>("/api/groups/:id", adminOnly, async (req, reply) => {
    const g = await tenantGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    await db.delete(groupMembers).where(eq(groupMembers.groupId, g.id));
    await db.delete(groups).where(eq(groups.id, g.id));
    await recordAudit({ action: "group.deleted", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/groups/:id/members", adminOnly, async (req, reply) => {
    const parsed = memberBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const tenantId = req.currentUser!.tenantId;
    const g = await tenantGroup(req.params.id, tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });

    // Only add people from this company.
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, parsed.data.userId), eq(users.tenantId, tenantId)));
    if (!u) return reply.code(400).send({ error: "invalid_user" });

    await db.insert(groupMembers).values({ groupId: g.id, userId: u.id }).onConflictDoNothing();
    await recordAudit({ action: "group.member_added", tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, userId: u.id } });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>(
    "/api/groups/:id/members/:userId",
    adminOnly,
    async (req, reply) => {
      const g = await tenantGroup(req.params.id, req.currentUser!.tenantId);
      if (!g) return reply.code(404).send({ error: "not_found" });
      await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, req.params.userId)));
      await recordAudit({ action: "group.member_removed", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, userId: req.params.userId } });
      return { ok: true };
    },
  );
}

async function tenantGroup(id: string, tenantId: string) {
  const [g] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.tenantId, tenantId)));
  return g ?? null;
}
