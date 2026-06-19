import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { achievements, achievementAwards, recognitions, tournamentMatches, tournaments, pointsLedger } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { currentStreak } from "../../lib/streak.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";

// A scheduled achievement is only live within its (optional, inclusive) date window.
const statusOf = (d: { activeFrom: string | null; activeUntil: string | null }, today: string) =>
  d.activeFrom && d.activeFrom > today ? "UPCOMING" : d.activeUntil && d.activeUntil < today ? "ENDED" : "ACTIVE";

const METRICS = ["BIGUPS_RECEIVED", "BIGUPS_GIVEN", "GAMES_WON", "CHECKIN_STREAK", "CHECKINS"] as const;
type Metric = (typeof METRICS)[number];
const num = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

// Current value of a metric for a user. MONTHLY filters to the current calendar month where the data
// is timestamped; GAMES_WON / CHECKIN_STREAK are point-in-time and ignore the period.
async function metricValue(metric: Metric, userId: string, tenantId: string, period: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthDay = monthStart.toISOString().slice(0, 10);
  const monthly = period === "MONTHLY";
  if (metric === "BIGUPS_RECEIVED") return num(await db.select({ n: count() }).from(recognitions).where(and(eq(recognitions.tenantId, tenantId), eq(recognitions.toUserId, userId), ...(monthly ? [gte(recognitions.createdAt, monthStart)] : []))));
  if (metric === "BIGUPS_GIVEN") return num(await db.select({ n: count() }).from(recognitions).where(and(eq(recognitions.tenantId, tenantId), eq(recognitions.fromUserId, userId), ...(monthly ? [gte(recognitions.createdAt, monthStart)] : []))));
  if (metric === "GAMES_WON") return num(await db.select({ n: count() }).from(tournamentMatches).innerJoin(tournaments, eq(tournaments.id, tournamentMatches.tournamentId)).where(and(eq(tournaments.tenantId, tenantId), eq(tournamentMatches.winnerId, userId))));
  if (metric === "CHECKIN_STREAK") return currentStreak(userId);
  if (metric === "CHECKINS") return num(await db.select({ n: count() }).from(pointsLedger).where(and(eq(pointsLedger.userId, userId), eq(pointsLedger.reason, "checkin"), ...(monthly ? [gte(pointsLedger.createdDay, monthDay)] : []))));
  return 0;
}
const periodKey = (period: string) => (period === "MONTHLY" ? new Date().toISOString().slice(0, 7) : "lifetime");

export function achievementRoutes(app: FastifyInstance) {
  // Only achievements scoped to the viewer (ALL, or a node/team they belong to).
  async function visibleDefs(me: { id: string; tenantId: string }) {
    const defs = await db.select().from(achievements).where(eq(achievements.tenantId, me.tenantId)).orderBy(achievements.category, achievements.name);
    const out = [];
    for (const d of defs) {
      if (d.scopeKind === "ALL" || (await canSeeScoped({ tenantId: me.tenantId, scopeKind: d.scopeKind, scopeId: d.scopeId }, me.id, me.tenantId))) out.push(d);
    }
    return out;
  }

  // Everyone sees the catalog of achievements they're eligible for (scope-filtered), with window status.
  app.get("/api/achievements", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const today = new Date().toISOString().slice(0, 10);
    const defs = await visibleDefs(me);
    const list = await Promise.all(defs.map(async (d) => ({ ...d, scope: await scopeLabel(me.tenantId, d.scopeKind, d.scopeId), status: statusOf(d, today) })));
    return { canManage: me.role === "TENANT_ADMIN", achievements: list };
  });

  // My progress — evaluates each achievement, auto-awards any newly earned (idempotent), returns progress.
  app.get("/api/achievements/me", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const today = new Date().toISOString().slice(0, 10);
    const defs = await visibleDefs(me);
    const out = [];
    for (const d of defs) {
      const value = await metricValue(d.metric as Metric, me.id, me.tenantId, d.period);
      const key = periodKey(d.period);
      const status = statusOf(d, today);
      const [existing] = await db.select({ at: achievementAwards.awardedAt }).from(achievementAwards).where(and(eq(achievementAwards.achievementId, d.id), eq(achievementAwards.userId, me.id), eq(achievementAwards.periodKey, key)));
      let awardedAt = existing?.at ?? null;
      if (value >= d.threshold && !existing && status === "ACTIVE") { // only earn while the challenge is live
        await db.insert(achievementAwards).values({ tenantId: me.tenantId, achievementId: d.id, userId: me.id, periodKey: key }).onConflictDoNothing();
        awardedAt = new Date();
      }
      out.push({ id: d.id, name: d.name, description: d.description, category: d.category, icon: d.icon, metric: d.metric, threshold: d.threshold, period: d.period, scope: await scopeLabel(me.tenantId, d.scopeKind, d.scopeId), status, activeFrom: d.activeFrom, activeUntil: d.activeUntil, value, earned: !!awardedAt, awardedAt: awardedAt ? new Date(awardedAt).toISOString() : null });
    }
    return { achievements: out };
  });

  const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const defBody = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(300).optional(),
    category: z.string().trim().max(40).optional(),
    icon: z.string().trim().max(8).optional(),
    metric: z.enum(METRICS),
    threshold: z.number().int().min(1).max(100000),
    period: z.enum(["LIFETIME", "MONTHLY"]),
    scopeKind: z.enum(["ALL", "NODE", "GROUP"]).optional(),
    scopeId: z.string().uuid().nullable().optional(),
    activeFrom: ymd.nullable().optional(),
    activeUntil: ymd.nullable().optional(),
  });
  // Cross-field rules (kept out of the zod schema so .partial() still works for PATCH): a node/team
  // achievement needs a target, and the window must not be inverted.
  function badScopeOrWindow(d: { scopeKind?: string; scopeId?: string | null; activeFrom?: string | null; activeUntil?: string | null }) {
    if ((d.scopeKind === "NODE" || d.scopeKind === "GROUP") && !d.scopeId) return true;
    if (d.activeFrom && d.activeUntil && d.activeUntil < d.activeFrom) return true;
    return false;
  }

  app.post("/api/achievements", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = defBody.safeParse(req.body);
    if (!body.success || badScopeOrWindow(body.data)) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const d = body.data;
    const scopeKind = d.scopeKind ?? "ALL";
    const [row] = await db.insert(achievements).values({ tenantId: me.tenantId, ...d, description: d.description || null, category: d.category || null, icon: d.icon || null, scopeKind, scopeId: scopeKind === "ALL" ? null : d.scopeId ?? null, activeFrom: d.activeFrom ?? null, activeUntil: d.activeUntil ?? null }).returning({ id: achievements.id });
    return { id: row.id };
  });

  app.patch<{ Params: { id: string } }>("/api/achievements/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = defBody.partial().safeParse(req.body);
    if (!id.success || !body.success || badScopeOrWindow(body.data)) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const patch = { ...body.data };
    if (patch.scopeKind === "ALL") patch.scopeId = null; // org-wide can't keep a stale target
    const res = await db.update(achievements).set(patch).where(and(eq(achievements.id, id.data), eq(achievements.tenantId, me.tenantId))).returning({ id: achievements.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/achievements/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [d] = await db.select({ id: achievements.id }).from(achievements).where(and(eq(achievements.id, id.data), eq(achievements.tenantId, me.tenantId)));
    if (!d) return reply.code(404).send({ error: "not_found" });
    await db.delete(achievementAwards).where(eq(achievementAwards.achievementId, id.data));
    await db.delete(achievements).where(eq(achievements.id, id.data));
    return { ok: true };
  });

  void desc;
}

// Earned achievements for a user (already-awarded only — no evaluation side-effects for other people).
export async function earnedAchievements(userId: string) {
  return db
    .select({ name: achievements.name, icon: achievements.icon, category: achievements.category })
    .from(achievementAwards)
    .innerJoin(achievements, eq(achievements.id, achievementAwards.achievementId))
    .where(eq(achievementAwards.userId, userId))
    .orderBy(desc(achievementAwards.awardedAt));
}
