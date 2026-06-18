import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { recognitions, recognitionLikes, users, orgNodes, groups } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { can, hasScope, isGoverned } from "../../lib/capabilities.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";
import { peopleInScope } from "../../lib/scope.js";

// Fixed preset of badges. Keep small — the frontend renders the same keys with emoji/labels.
const BADGES = ["team-player", "above-beyond", "helping-hand", "bright-idea", "customer-hero", "great-attitude"] as const;
const RECENT_DAYS = 30;
const BOARD_DAYS = 30;

export function recognitionRoutes(app: FastifyInstance) {
  // A plain peer big-up (to a person, their own dept, no overrides) is open to everyone. Anything
  // "official" — an AWARD, a dept/team recipient, or a wider/custom visibility — needs the
  // recognition.award capability. No-lockout: ungoverned tenants stay open; admins always pass.
  type Me = { id: string; tenantId: string; role: string };
  async function mayIssueOfficial(me: Me, scopeKind: string, scopeId: string | null): Promise<boolean> {
    if (!(await isGoverned(me.id))) return true;
    if (scopeKind === "ALL") return hasScope(me, "recognition.award", "ORG");
    if (scopeKind === "NODE" && scopeId) return can(me, "recognition.award", scopeId);
    return can(me, "recognition.award");
  }
  const canSee = (me: Me, r: { fromUserId?: string; fromId?: string; recipientType: string; toUserId: string | null; scopeKind: string; scopeId: string | null }) => {
    const from = r.fromUserId ?? r.fromId;
    if (from === me.id || (r.recipientType === "USER" && r.toUserId === me.id)) return Promise.resolve(true);
    return canSeeScoped({ tenantId: me.tenantId, scopeKind: r.scopeKind, scopeId: r.scopeId }, me.id, me.tenantId);
  };

  // Give recognition — to a person, a whole department (NODE), or a team (GROUP).
  app.post("/api/recognitions", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(["BIGUP", "AWARD"]).default("BIGUP"),
        recipientType: z.enum(["USER", "NODE", "GROUP"]).default("USER"),
        recipientId: z.string().uuid(),
        badge: z.enum(BADGES),
        message: z.string().trim().min(1).max(500),
        scopeKind: z.enum(["ALL", "NODE", "GROUP"]).optional(),
        scopeId: z.string().uuid().nullable().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const d = body.data;

    // Resolve the recipient and the default visibility scope it implies.
    let cols: { toUserId?: string; recipientNodeId?: string; recipientGroupId?: string } = {};
    let defScope: { scopeKind: string; scopeId: string | null };
    if (d.recipientType === "USER") {
      if (d.recipientId === me.id) return reply.code(400).send({ error: "cannot_recognise_self" });
      const [u] = await db.select({ id: users.id, nodeId: users.nodeId }).from(users).where(and(eq(users.id, d.recipientId), eq(users.tenantId, me.tenantId), eq(users.status, "ACTIVE")));
      if (!u) return reply.code(404).send({ error: "recipient_not_found" });
      cols = { toUserId: u.id };
      defScope = u.nodeId ? { scopeKind: "NODE", scopeId: u.nodeId } : { scopeKind: "ALL", scopeId: null };
    } else if (d.recipientType === "NODE") {
      const [n] = await db.select({ id: orgNodes.id }).from(orgNodes).where(and(eq(orgNodes.id, d.recipientId), eq(orgNodes.tenantId, me.tenantId)));
      if (!n) return reply.code(404).send({ error: "recipient_not_found" });
      cols = { recipientNodeId: n.id };
      defScope = { scopeKind: "NODE", scopeId: n.id };
    } else {
      const [g] = await db.select({ id: groups.id }).from(groups).where(and(eq(groups.id, d.recipientId), eq(groups.tenantId, me.tenantId)));
      if (!g) return reply.code(404).send({ error: "recipient_not_found" });
      cols = { recipientGroupId: g.id };
      defScope = { scopeKind: "GROUP", scopeId: g.id };
    }

    // If the caller chose a visibility explicitly, validate it; otherwise use the default.
    const scopeKind = d.scopeKind ?? defScope.scopeKind;
    const scopeId = d.scopeKind ? d.scopeId ?? null : defScope.scopeId;
    if (d.scopeKind === "NODE") {
      if (!scopeId) return reply.code(400).send({ error: "bad_scope" });
      const [n] = await db.select({ id: orgNodes.id }).from(orgNodes).where(and(eq(orgNodes.id, scopeId), eq(orgNodes.tenantId, me.tenantId)));
      if (!n) return reply.code(400).send({ error: "bad_scope" });
    }
    if (d.scopeKind === "GROUP") {
      if (!scopeId) return reply.code(400).send({ error: "bad_scope" });
      const [g] = await db.select({ id: groups.id }).from(groups).where(and(eq(groups.id, scopeId), eq(groups.tenantId, me.tenantId)));
      if (!g) return reply.code(400).send({ error: "bad_scope" });
    }

    // Recognising a whole dept/team is inherently an official award, never a casual peer big-up.
    const kind = d.recipientType !== "USER" ? "AWARD" : d.kind;
    const official = kind === "AWARD" || d.scopeKind !== undefined;
    if (official && !(await mayIssueOfficial(me, scopeKind, scopeId))) return reply.code(403).send({ error: "forbidden" });

    const [row] = await db
      .insert(recognitions)
      .values({ tenantId: me.tenantId, fromUserId: me.id, kind, recipientType: d.recipientType, ...cols, scopeKind, scopeId, badge: d.badge, message: d.message.trim() })
      .returning({ id: recognitions.id });
    if (official) await recordAudit({ action: "recognition.issued", tenantId: me.tenantId, actorId: me.id, meta: { id: row.id, kind, recipientType: d.recipientType, scopeKind } });
    return { id: row.id };
  });

  // The wall — only what the viewer is in scope to see. ?filter=past flips recent (≤30d) ↔ older.
  app.get("/api/recognitions", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const past = (req.query as { filter?: string })?.filter === "past";
    const cutoff = new Date(Date.now() - RECENT_DAYS * 86400_000);
    const fromU = alias(users, "from_u");
    const rows = await db
      .select({
        id: recognitions.id, kind: recognitions.kind, badge: recognitions.badge, message: recognitions.message, createdAt: recognitions.createdAt,
        fromId: recognitions.fromUserId, fromName: fromU.displayName,
        recipientType: recognitions.recipientType, toUserId: recognitions.toUserId, recipientNodeId: recognitions.recipientNodeId, recipientGroupId: recognitions.recipientGroupId,
        scopeKind: recognitions.scopeKind, scopeId: recognitions.scopeId,
      })
      .from(recognitions)
      .innerJoin(fromU, eq(fromU.id, recognitions.fromUserId))
      .where(and(eq(recognitions.tenantId, me.tenantId), past ? lt(recognitions.createdAt, cutoff) : gte(recognitions.createdAt, cutoff)))
      .orderBy(desc(recognitions.createdAt))
      .limit(100);

    // Batch-resolve recipient display info. For people we also pull job title + department.
    const uIds = rows.map((r) => r.toUserId).filter(Boolean) as string[];
    const nIds = rows.map((r) => r.recipientNodeId).filter(Boolean) as string[];
    const gIds = rows.map((r) => r.recipientGroupId).filter(Boolean) as string[];
    const uInfo = new Map((uIds.length ? await db.select({ id: users.id, name: users.displayName, jobTitle: users.jobTitle, dept: orgNodes.name }).from(users).leftJoin(orgNodes, eq(orgNodes.id, users.nodeId)).where(inArray(users.id, uIds)) : []).map((x) => [x.id, x]));
    const nName = new Map(nIds.length ? (await db.select({ id: orgNodes.id, name: orgNodes.name }).from(orgNodes).where(inArray(orgNodes.id, nIds))).map((x) => [x.id, x.name]) : []);
    const gName = new Map(gIds.length ? (await db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, gIds))).map((x) => [x.id, x.name]) : []);
    const isAdmin = me.role === "TENANT_ADMIN";

    const items = [];
    for (const r of rows) {
      if (!(await canSee(me, r))) continue;
      const u = r.recipientType === "USER" ? uInfo.get(r.toUserId!) : undefined;
      const recipientName = r.recipientType === "USER" ? u?.name ?? "Someone" : r.recipientType === "NODE" ? nName.get(r.recipientNodeId!) ?? "Department" : gName.get(r.recipientGroupId!) ?? "Team";
      items.push({
        id: r.id, kind: r.kind, badge: r.badge, message: r.message, createdAt: r.createdAt,
        fromName: r.fromName, fromId: r.fromId, recipientType: r.recipientType, recipientName, recipientUserId: r.recipientType === "USER" ? r.toUserId : null, isGroupRecipient: r.recipientType !== "USER",
        recipientTitle: u?.jobTitle ?? null, recipientDept: u?.dept ?? null,
        scope: await scopeLabel(me.tenantId, r.scopeKind, r.scopeId),
        canDelete: isAdmin || r.fromId === me.id,
        likes: 0, likedByMe: false,
      });
    }

    // Attach like counts + whether the viewer liked each (no notifications on likes).
    const visIds = items.map((i) => i.id);
    if (visIds.length) {
      const counts = new Map<string, number>();
      const mine = new Set<string>();
      for (const l of await db.select({ rid: recognitionLikes.recognitionId, uid: recognitionLikes.userId }).from(recognitionLikes).where(inArray(recognitionLikes.recognitionId, visIds))) {
        counts.set(l.rid, (counts.get(l.rid) ?? 0) + 1);
        if (l.uid === me.id) mine.add(l.rid);
      }
      for (const i of items) { i.likes = counts.get(i.id) ?? 0; i.likedByMe = mine.has(i.id); }
    }
    return { items };
  });

  // Star / un-star a recognition (toggle). Visible support only — never notifies.
  app.post("/api/recognitions/:id/like", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [r] = await db.select().from(recognitions).where(and(eq(recognitions.id, id.data), eq(recognitions.tenantId, me.tenantId)));
    if (!r) return reply.code(404).send({ error: "not_found" });
    if (!(await canSee(me, r))) return reply.code(403).send({ error: "forbidden" });
    const [existing] = await db.select().from(recognitionLikes).where(and(eq(recognitionLikes.recognitionId, id.data), eq(recognitionLikes.userId, me.id)));
    if (existing) await db.delete(recognitionLikes).where(and(eq(recognitionLikes.recognitionId, id.data), eq(recognitionLikes.userId, me.id)));
    else await db.insert(recognitionLikes).values({ recognitionId: id.data, userId: me.id });
    const [{ n }] = await db.select({ n: count() }).from(recognitionLikes).where(eq(recognitionLikes.recognitionId, id.data));
    return { liked: !existing, likes: Number(n) };
  });

  // Members behind a dept/team award (lazy-loaded when the card is clicked).
  app.get("/api/recognitions/:id/recipients", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [r] = await db.select().from(recognitions).where(and(eq(recognitions.id, id.data), eq(recognitions.tenantId, me.tenantId)));
    if (!r) return reply.code(404).send({ error: "not_found" });
    if (!(await canSee(me, r))) return reply.code(403).send({ error: "forbidden" });
    if (r.recipientType === "USER") {
      const [u] = await db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.id, r.toUserId!));
      return { people: u ? [u] : [] };
    }
    const people = await peopleInScope(me.tenantId, r.recipientType as "NODE" | "GROUP", r.recipientType === "NODE" ? r.recipientNodeId : r.recipientGroupId);
    return { people: people.map((p) => ({ id: p.id, name: p.name })) };
  });

  // Boards: most-celebrated *individuals* (last 30d) + per-dept totals, within what the viewer sees.
  app.get("/api/recognitions/board", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const toU = alias(users, "to_u");
    const since = new Date(Date.now() - BOARD_DAYS * 86400_000);
    const rows = await db
      .select({ toId: recognitions.toUserId, toName: toU.displayName, dept: orgNodes.name, fromId: recognitions.fromUserId, recipientType: recognitions.recipientType, scopeKind: recognitions.scopeKind, scopeId: recognitions.scopeId })
      .from(recognitions)
      .innerJoin(toU, eq(toU.id, recognitions.toUserId)) // inner join → only USER recipients count here
      .leftJoin(orgNodes, eq(orgNodes.id, toU.nodeId))
      .where(and(eq(recognitions.tenantId, me.tenantId), gte(recognitions.createdAt, since)));

    const byPerson = new Map<string, { name: string; dept: string | null; count: number }>();
    const byDept = new Map<string, number>();
    for (const r of rows) {
      if (!(await canSee(me, { ...r, toUserId: r.toId }))) continue;
      const p = byPerson.get(r.toId!) ?? { name: r.toName, dept: r.dept, count: 0 };
      p.count++;
      byPerson.set(r.toId!, p);
      if (r.dept) byDept.set(r.dept, (byDept.get(r.dept) ?? 0) + 1);
    }
    const people = [...byPerson.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    const departments = [...byDept.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return { windowDays: BOARD_DAYS, people, departments };
  });

  // Remove a big-up: the giver can take theirs back; an admin can moderate any (audited).
  app.delete("/api/recognitions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [row] = await db.select({ fromUserId: recognitions.fromUserId }).from(recognitions).where(and(eq(recognitions.id, id.data), eq(recognitions.tenantId, me.tenantId)));
    if (!row) return reply.code(404).send({ error: "not_found" });
    const isAdmin = me.role === "TENANT_ADMIN";
    if (row.fromUserId !== me.id && !isAdmin) return reply.code(403).send({ error: "forbidden" });
    await db.delete(recognitionLikes).where(eq(recognitionLikes.recognitionId, id.data));
    await db.delete(recognitions).where(eq(recognitions.id, id.data));
    if (isAdmin && row.fromUserId !== me.id) await recordAudit({ action: "recognition.moderated", tenantId: me.tenantId, actorId: me.id, meta: { id: id.data } });
    return { ok: true };
  });
}
