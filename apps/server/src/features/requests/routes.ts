import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { permissionGroups, requestApprovals, requests, userPermissionGroups, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { can } from "../../lib/capabilities.js";
import { recordAudit } from "../../lib/audit.js";

// Multi-sign policy: joining a group at/above this level needs more than one approver.
const ELEVATED_LEVEL = 3;
const APPROVALS_WHEN_ELEVATED = 2;

export function requestRoutes(app: FastifyInstance) {
  const isApprover = (user: { id: string; tenantId: string; role: string }) => can(user, "member.approve");

  // Submit a request — join a permission group, or a free-form ask ("pin to the org board").
  app.post("/api/requests", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("PERMISSION_GRANT"), groupId: z.string().uuid(), subjectUserId: z.string().uuid().optional() }),
        z.object({ kind: z.literal("GENERIC"), title: z.string().min(1).max(300) }),
      ])
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;

    if (body.data.kind === "PERMISSION_GRANT") {
      // Only admins may request elevation for someone else; everyone else requests for themselves.
      const subjectUserId = body.data.subjectUserId && me.role === "TENANT_ADMIN" ? body.data.subjectUserId : me.id;
      const [g] = await db.select().from(permissionGroups).where(and(eq(permissionGroups.id, body.data.groupId), eq(permissionGroups.tenantId, me.tenantId)));
      if (!g) return reply.code(400).send({ error: "invalid_group" });
      const requiredApprovals = g.level >= ELEVATED_LEVEL ? APPROVALS_WHEN_ELEVATED : 1;
      const [r] = await db.insert(requests).values({ tenantId: me.tenantId, kind: "PERMISSION_GRANT", subjectUserId, groupId: g.id, requiredApprovals, createdBy: me.id }).returning();
      await recordAudit({ action: "request.created", tenantId: me.tenantId, actorId: me.id, meta: { requestId: r.id, kind: "PERMISSION_GRANT", groupId: g.id, subjectUserId, requiredApprovals } });
      return { id: r.id };
    }
    const [r] = await db.insert(requests).values({ tenantId: me.tenantId, kind: "GENERIC", title: body.data.title, requiredApprovals: 1, createdBy: me.id }).returning();
    await recordAudit({ action: "request.created", tenantId: me.tenantId, actorId: me.id, meta: { requestId: r.id, kind: "GENERIC" } });
    return { id: r.id };
  });

  // My requests + (for approvers) the pending queue, with approval progress.
  app.get("/api/requests", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const approver = await isApprover(me);
    const subject = alias(users, "subject");
    const creator = alias(users, "creator");
    const rows = await db
      .select({ id: requests.id, kind: requests.kind, title: requests.title, status: requests.status, requiredApprovals: requests.requiredApprovals, createdBy: requests.createdBy, subjectUserId: requests.subjectUserId, createdAt: requests.createdAt, groupName: permissionGroups.name, subjectName: subject.displayName, creatorName: creator.displayName })
      .from(requests)
      .leftJoin(permissionGroups, eq(permissionGroups.id, requests.groupId))
      .leftJoin(subject, eq(subject.id, requests.subjectUserId))
      .leftJoin(creator, eq(creator.id, requests.createdBy))
      .where(eq(requests.tenantId, me.tenantId))
      .orderBy(desc(requests.createdAt))
      .limit(200);
    const ids = rows.map((r) => r.id);
    const apps = ids.length ? await db.select().from(requestApprovals).where(inArray(requestApprovals.requestId, ids)) : [];
    const decorate = (r: (typeof rows)[number]) => ({ ...r, createdAt: r.createdAt.toISOString(), approvals: apps.filter((a) => a.requestId === r.id).length, iApproved: apps.some((a) => a.requestId === r.id && a.approverId === me.id) });
    const all = rows.map(decorate);
    return {
      isApprover: approver,
      mine: all.filter((r) => r.createdBy === me.id || r.subjectUserId === me.id),
      queue: approver ? all.filter((r) => r.status === "PENDING") : [],
    };
  });

  for (const action of ["approve", "reject"] as const) {
    app.post<{ Params: { id: string } }>(`/api/requests/:id/${action}`, { preHandler: requireAuth }, async (req, reply) => {
      const me = req.currentUser!;
      if (!(await isApprover(me))) return reply.code(403).send({ error: "not_allowed" });
      const [r] = await db.select().from(requests).where(and(eq(requests.id, req.params.id), eq(requests.tenantId, me.tenantId)));
      if (!r || r.status !== "PENDING") return reply.code(404).send({ error: "not_found" });
      if (r.createdBy === me.id || r.subjectUserId === me.id) return reply.code(403).send({ error: "cannot_approve_own" }); // multi-sign integrity

      if (action === "reject") {
        await db.update(requests).set({ status: "REJECTED" }).where(eq(requests.id, r.id));
        await recordAudit({ action: "request.rejected", tenantId: me.tenantId, actorId: me.id, meta: { requestId: r.id } });
        return { ok: true };
      }

      await db.insert(requestApprovals).values({ requestId: r.id, approverId: me.id }).onConflictDoNothing();
      const [{ c }] = await db.select({ c: count() }).from(requestApprovals).where(eq(requestApprovals.requestId, r.id));
      const approvals = Number(c);
      await recordAudit({ action: "request.approved", tenantId: me.tenantId, actorId: me.id, meta: { requestId: r.id, approvals, required: r.requiredApprovals } });

      if (approvals >= r.requiredApprovals) {
        // Apply the effect, then close the request.
        if (r.kind === "PERMISSION_GRANT" && r.subjectUserId && r.groupId) {
          await db.insert(userPermissionGroups).values({ userId: r.subjectUserId, groupId: r.groupId }).onConflictDoNothing();
        }
        await db.update(requests).set({ status: "APPROVED" }).where(eq(requests.id, r.id));
        await recordAudit({ action: "request.fulfilled", tenantId: me.tenantId, actorId: me.id, meta: { requestId: r.id, kind: r.kind } });
      }
      return { ok: true };
    });
  }
}
