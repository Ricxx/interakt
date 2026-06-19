import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, orgNodes, recognitions, recognitionLikes, tenants, redemptions } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";
import { currentStreak } from "../../lib/streak.js";
import { earnedAchievements } from "../achievements/routes.js";

async function picsEnabled(tenantId: string): Promise<boolean> {
  const [t] = await db.select({ on: tenants.profilePicsEnabled }).from(tenants).where(eq(tenants.id, tenantId));
  return !!t?.on;
}

// A person's public profile card — shown as an overlay anywhere a name is clicked. Today it's
// identity + the recognition they've received; later this is where awards/trinkets/achievements
// from a marketplace will hang. Recognition is attributed by design, so showing it here is fine;
// we still only surface the items the *viewer* is in scope to see.
export function profileRoutes(app: FastifyInstance) {
  // Profile augments the user owns (bought from the shop), grouped by slot, + what's equipped in each slot.
  app.get("/api/profile/augments", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db.select({ a: redemptions.augment, k: redemptions.augmentKind }).from(redemptions).where(and(eq(redemptions.userId, me.id), isNotNull(redemptions.augment)));
    const group = (kind: string) => [...new Set(rows.filter((r) => r.k === kind).map((r) => r.a as string))];
    const [u] = await db.select({ flair: users.flair, title: users.title, nameColor: users.nameColor }).from(users).where(eq(users.id, me.id));
    return { owned: { FLAIR: group("FLAIR"), TITLE: group("TITLE"), COLOR: group("COLOR") }, equipped: { flair: u?.flair ?? null, title: u?.title ?? null, nameColor: u?.nameColor ?? null } };
  });

  // You can only equip an augment you own (a redemption in the matching slot).
  const ownsAugment = async (userId: string, value: string, kind: string) =>
    !!(await db.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.augment, value), eq(redemptions.augmentKind, kind))))[0];

  // Edit your OWN profile: status line, bio fields, avatar (if pics allowed), and equipped augments.
  app.patch("/api/profile/me", { preHandler: requireAuth }, async (req, reply) => {
    // Accept a full URL or an in-app uploaded path (/api/uploads/…).
    const imageRef = z.string().trim().max(1000).refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/api/uploads/"), "bad_url");
    const body = z.object({ statusText: z.string().trim().max(80).nullable().optional(), hobbies: z.string().trim().max(280).nullable().optional(), highSchool: z.string().trim().max(120).nullable().optional(), avatarUrl: imageRef.nullable().optional(), flair: z.string().trim().max(8).nullable().optional(), title: z.string().trim().max(40).nullable().optional(), nameColor: z.string().trim().max(20).nullable().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const patch: Record<string, unknown> = {};
    if (body.data.statusText !== undefined) patch.statusText = body.data.statusText || null;
    if (body.data.hobbies !== undefined) patch.hobbies = body.data.hobbies || null;
    if (body.data.highSchool !== undefined) patch.highSchool = body.data.highSchool || null;
    if (body.data.avatarUrl !== undefined) {
      if (body.data.avatarUrl && !(await picsEnabled(me.tenantId))) return reply.code(403).send({ error: "pics_disabled" });
      patch.avatarUrl = body.data.avatarUrl || null;
    }
    for (const [field, slot] of [["flair", "FLAIR"], ["title", "TITLE"], ["nameColor", "COLOR"]] as const) {
      const v = body.data[field];
      if (v === undefined) continue;
      if (v && !(await ownsAugment(me.id, v, slot))) return reply.code(403).send({ error: "augment_not_owned" });
      patch[field] = v || null;
    }
    if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, me.id));
    return { ok: true };
  });

  app.get("/api/profile/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [u] = await db
      .select({ id: users.id, name: users.displayName, jobTitle: users.jobTitle, role: users.role, dept: orgNodes.name, avatarUrl: users.avatarUrl, statusText: users.statusText, hobbies: users.hobbies, highSchool: users.highSchool, flair: users.flair, title: users.title, nameColor: users.nameColor })
      .from(users)
      .leftJoin(orgNodes, eq(orgNodes.id, users.nodeId))
      .where(and(eq(users.id, id.data), eq(users.tenantId, me.tenantId)));
    if (!u) return reply.code(404).send({ error: "not_found" });
    const avatarUrl = (await picsEnabled(me.tenantId)) ? u.avatarUrl : null; // hidden when the institution disables pics

    const fromU = alias(users, "from_u");
    const rows = await db
      .select({ id: recognitions.id, kind: recognitions.kind, badge: recognitions.badge, message: recognitions.message, createdAt: recognitions.createdAt, fromName: fromU.displayName, fromId: recognitions.fromUserId, scopeKind: recognitions.scopeKind, scopeId: recognitions.scopeId })
      .from(recognitions)
      .innerJoin(fromU, eq(fromU.id, recognitions.fromUserId))
      .where(and(eq(recognitions.tenantId, me.tenantId), eq(recognitions.toUserId, id.data)))
      .orderBy(desc(recognitions.createdAt))
      .limit(40);

    const visible = [];
    for (const r of rows) {
      const see = r.fromId === me.id || id.data === me.id || (await canSeeScoped({ tenantId: me.tenantId, scopeKind: r.scopeKind, scopeId: r.scopeId }, me.id, me.tenantId));
      if (see) visible.push(r);
      if (visible.length >= 12) break;
    }

    const ids = visible.map((r) => r.id);
    const stars = new Map<string, number>();
    if (ids.length) for (const l of await db.select({ rid: recognitionLikes.recognitionId }).from(recognitionLikes).where(inArray(recognitionLikes.recognitionId, ids))) stars.set(l.rid, (stars.get(l.rid) ?? 0) + 1);

    const received = await Promise.all(
      visible.map(async (r) => ({ id: r.id, kind: r.kind, badge: r.badge, message: r.message, createdAt: r.createdAt, fromName: r.fromName, scope: await scopeLabel(me.tenantId, r.scopeKind, r.scopeId), likes: stars.get(r.id) ?? 0 })),
    );
    const totalStars = [...stars.values()].reduce((a, b) => a + b, 0);
    return { id: u.id, name: u.name, jobTitle: u.jobTitle, dept: u.dept, role: u.role, avatarUrl, statusText: u.statusText, hobbies: u.hobbies, highSchool: u.highSchool, flair: u.flair, title: u.title, nameColor: u.nameColor, isMe: u.id === me.id, streak: await currentStreak(u.id), achievements: await earnedAchievements(u.id), received, totalReceived: received.length, totalStars };
  });
}
