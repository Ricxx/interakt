import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { permissionGroupCaps, permissionGroupParents, permissionGroups, userPermissionGroups, users } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { CAPABILITIES, CAPABILITY_CATEGORIES, SCOPES } from "../../lib/capabilities.js";
import { recordAudit } from "../../lib/audit.js";

const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };
const CAP_KEYS = CAPABILITIES.map((c) => c.key) as [string, ...string[]];

export function permissionRoutes(app: FastifyInstance) {
  // The capability registry (grouped by category) — drives the admin matrix UI.
  app.get("/api/permission-groups/capabilities", { preHandler: requireAuth }, async () => ({ capabilities: CAPABILITIES, scopes: SCOPES, categories: CAPABILITY_CATEGORIES }));

  // Lightweight group list for any member (drives the "request to join" picker). Names/levels only.
  app.get("/api/permission-groups/list", { preHandler: requireAuth }, async (req) => {
    const rows = await db.select({ id: permissionGroups.id, name: permissionGroups.name, level: permissionGroups.level }).from(permissionGroups).where(eq(permissionGroups.tenantId, req.currentUser!.tenantId)).orderBy(permissionGroups.level, permissionGroups.name);
    return { groups: rows };
  });

  // List groups with capabilities, inherited parents, level, and member counts.
  app.get("/api/permission-groups", adminOnly, async (req) => {
    const tenantId = req.currentUser!.tenantId;
    const groups = await db.select().from(permissionGroups).where(eq(permissionGroups.tenantId, tenantId)).orderBy(permissionGroups.level, permissionGroups.name);
    const ids = groups.map((g) => g.id);
    const caps = ids.length ? await db.select().from(permissionGroupCaps).where(inArray(permissionGroupCaps.groupId, ids)) : [];
    const members = ids.length ? await db.select({ groupId: userPermissionGroups.groupId }).from(userPermissionGroups).where(inArray(userPermissionGroups.groupId, ids)) : [];
    const parents = ids.length ? await db.select().from(permissionGroupParents).where(inArray(permissionGroupParents.groupId, ids)) : [];
    return {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        level: g.level,
        caps: caps.filter((c) => c.groupId === g.id).map((c) => ({ capability: c.capability, scope: c.scope })),
        parentIds: parents.filter((p) => p.groupId === g.id).map((p) => p.parentId),
        memberCount: members.filter((m) => m.groupId === g.id).length,
      })),
    };
  });

  app.post("/api/permission-groups", adminOnly, async (req, reply) => {
    const body = z.object({ name: z.string().min(1).max(80), level: z.number().int().min(1).max(99).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const [g] = await db.insert(permissionGroups).values({ tenantId: req.currentUser!.tenantId, name: body.data.name, level: body.data.level ?? 1 }).returning();
    await recordAudit({ action: "perm.group_created", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, name: g.name, level: g.level } });
    return { id: g.id };
  });

  // Update name/level.
  app.patch<{ Params: { id: string } }>("/api/permission-groups/:id", adminOnly, async (req, reply) => {
    const body = z.object({ name: z.string().min(1).max(80).optional(), level: z.number().int().min(1).max(99).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    const patch: Record<string, unknown> = {};
    if (body.data.name !== undefined) patch.name = body.data.name;
    if (body.data.level !== undefined) patch.level = body.data.level;
    if (Object.keys(patch).length) await db.update(permissionGroups).set(patch).where(eq(permissionGroups.id, g.id));
    return { ok: true };
  });

  // Set the groups this one inherits from (cycle-checked).
  app.put<{ Params: { id: string } }>("/api/permission-groups/:id/parents", adminOnly, async (req, reply) => {
    const body = z.object({ parentIds: z.array(z.string().uuid()) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    // reject self and any parent that already (transitively) inherits this group → no cycles
    const edges = await db.select().from(permissionGroupParents);
    const parentsOf = new Map<string, string[]>();
    for (const e of edges) parentsOf.set(e.groupId, [...(parentsOf.get(e.groupId) ?? []), e.parentId]);
    const ancestors = (start: string): Set<string> => {
      const seen = new Set<string>(); const q = [start]; let guard = 0;
      while (q.length && guard++ < 1000) { const x = q.shift()!; for (const p of parentsOf.get(x) ?? []) if (!seen.has(p)) { seen.add(p); q.push(p); } }
      return seen;
    };
    for (const p of body.data.parentIds) {
      if (p === g.id || ancestors(p).has(g.id)) return reply.code(400).send({ error: "would_create_cycle" });
    }
    await db.delete(permissionGroupParents).where(eq(permissionGroupParents.groupId, g.id));
    if (body.data.parentIds.length) await db.insert(permissionGroupParents).values(body.data.parentIds.map((parentId) => ({ groupId: g.id, parentId })));
    await recordAudit({ action: "perm.inherits_set", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, parentIds: body.data.parentIds } });
    return { ok: true };
  });

  // Duplicate a group's capabilities + level into a new "(copy)" group (a one-time snapshot).
  app.post<{ Params: { id: string } }>("/api/permission-groups/:id/duplicate", adminOnly, async (req, reply) => {
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    const [copy] = await db.insert(permissionGroups).values({ tenantId: g.tenantId, name: `${g.name} (copy)`, level: g.level }).returning();
    const caps = await db.select().from(permissionGroupCaps).where(eq(permissionGroupCaps.groupId, g.id));
    if (caps.length) await db.insert(permissionGroupCaps).values(caps.map((c) => ({ groupId: copy.id, capability: c.capability, scope: c.scope })));
    await recordAudit({ action: "perm.group_duplicated", tenantId: g.tenantId, actorId: req.currentUser!.id, meta: { from: g.id, to: copy.id } });
    return { id: copy.id };
  });

  app.delete<{ Params: { id: string } }>("/api/permission-groups/:id", adminOnly, async (req, reply) => {
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    await db.delete(permissionGroupCaps).where(eq(permissionGroupCaps.groupId, g.id));
    await db.delete(userPermissionGroups).where(eq(userPermissionGroups.groupId, g.id));
    await db.delete(permissionGroupParents).where(eq(permissionGroupParents.groupId, g.id));
    await db.delete(permissionGroupParents).where(eq(permissionGroupParents.parentId, g.id));
    await db.delete(permissionGroups).where(eq(permissionGroups.id, g.id));
    await recordAudit({ action: "perm.group_deleted", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id } });
    return { ok: true };
  });

  // Replace a group's capability set. Scoped caps require a scope; boolean caps ignore it.
  app.put<{ Params: { id: string } }>("/api/permission-groups/:id/caps", adminOnly, async (req, reply) => {
    const body = z.object({ caps: z.array(z.object({ capability: z.enum(CAP_KEYS), scope: z.enum(SCOPES).nullish() })).max(CAPABILITIES.length) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    const scopedKeys = new Set<string>(CAPABILITIES.filter((c) => c.scoped).map((c) => c.key));
    const rows = body.data.caps.map((c) => ({ groupId: g.id, capability: c.capability, scope: scopedKeys.has(c.capability) ? c.scope ?? "SELF" : null }));
    await db.delete(permissionGroupCaps).where(eq(permissionGroupCaps.groupId, g.id));
    if (rows.length) await db.insert(permissionGroupCaps).values(rows);
    await recordAudit({ action: "perm.caps_set", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, caps: rows.map((r) => `${r.capability}${r.scope ? `@${r.scope}` : ""}`) } });
    return { ok: true };
  });

  // Which permission groups a given member is in (drives assignment on the Members page).
  app.get<{ Params: { userId: string } }>("/api/permission-groups/of/:userId", adminOnly, async (req) => {
    const rows = await db.select({ groupId: userPermissionGroups.groupId }).from(userPermissionGroups).where(eq(userPermissionGroups.userId, req.params.userId));
    return { groupIds: rows.map((r) => r.groupId) };
  });

  app.get<{ Params: { id: string } }>("/api/permission-groups/:id/members", adminOnly, async (req, reply) => {
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    const rows = await db.select({ id: users.id, name: users.displayName }).from(userPermissionGroups).innerJoin(users, eq(users.id, userPermissionGroups.userId)).where(eq(userPermissionGroups.groupId, g.id)).orderBy(users.displayName);
    return { members: rows };
  });

  app.post<{ Params: { id: string } }>("/api/permission-groups/:id/members", adminOnly, async (req, reply) => {
    const body = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, body.data.userId), eq(users.tenantId, req.currentUser!.tenantId)));
    if (!u) return reply.code(400).send({ error: "invalid_user" });
    await db.insert(userPermissionGroups).values({ groupId: g.id, userId: u.id }).onConflictDoNothing();
    await recordAudit({ action: "perm.member_added", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, userId: u.id } });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>("/api/permission-groups/:id/members/:userId", adminOnly, async (req, reply) => {
    const g = await ownGroup(req.params.id, req.currentUser!.tenantId);
    if (!g) return reply.code(404).send({ error: "not_found" });
    await db.delete(userPermissionGroups).where(and(eq(userPermissionGroups.groupId, g.id), eq(userPermissionGroups.userId, req.params.userId)));
    await recordAudit({ action: "perm.member_removed", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { groupId: g.id, userId: req.params.userId } });
    return { ok: true };
  });
}

async function ownGroup(id: string, tenantId: string) {
  const [g] = await db.select().from(permissionGroups).where(and(eq(permissionGroups.id, id), eq(permissionGroups.tenantId, tenantId)));
  return g ?? null;
}
