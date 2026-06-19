import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pointsLedger, pointsLeaveDays, checkinRewards } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { can } from "../../lib/capabilities.js";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = () => ymd(new Date());
const prevDay = (day: string) => ymd(new Date(Date.parse(day) - 86400_000));
const BASE = 10; // points for a daily check-in
const bonus = (streak: number) => Math.min(streak, 7) * 2; // up to +14 for a 7-day+ streak

export function pointsRoutes(app: FastifyInstance) {
  async function load(userId: string) {
    const rows = await db.select({ delta: pointsLedger.delta, reason: pointsLedger.reason, day: pointsLedger.createdDay }).from(pointsLedger).where(eq(pointsLedger.userId, userId));
    const balance = rows.reduce((s, r) => s + r.delta, 0);
    const checkinDays = new Set(rows.filter((r) => r.reason === "checkin").map((r) => r.day));
    const leaveDays = new Set((await db.select({ day: pointsLeaveDays.day }).from(pointsLeaveDays).where(eq(pointsLeaveDays.userId, userId))).map((r) => r.day));
    return { balance, checkinDays, leaveDays };
  }
  // Consecutive days ending at `day` that are "covered" (a check-in or a logged leave day); the count
  // is the number of check-ins in that run (leave days bridge gaps but don't add points).
  const streakEndingAt = (day: string, checkinDays: Set<string>, leaveDays: Set<string>) => {
    let d = day, streak = 0, guard = 0;
    while ((checkinDays.has(d) || leaveDays.has(d)) && guard++ < 3650) { if (checkinDays.has(d)) streak++; d = prevDay(d); }
    return streak;
  };

  app.get("/api/points/me", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const { balance, checkinDays, leaveDays } = await load(me.id);
    const t = today();
    const checkedInToday = checkinDays.has(t);
    const streak = streakEndingAt(checkedInToday ? t : prevDay(t), checkinDays, leaveDays);
    const recent = await db.select({ delta: pointsLedger.delta, reason: pointsLedger.reason, day: pointsLedger.createdDay }).from(pointsLedger).where(eq(pointsLedger.userId, me.id)).orderBy(desc(pointsLedger.createdAt)).limit(10);
    const [lot] = await db.select({ id: pointsLedger.id }).from(pointsLedger).where(and(eq(pointsLedger.userId, me.id), eq(pointsLedger.reason, "lottery"), eq(pointsLedger.createdDay, t)));
    return { balance, streak, checkedInToday, lotteryToday: !!lot, recent };
  });

  // Claim today's check-in (once per day). Awards base (or the day's POINTS reward) + a streak bonus;
  // a non-POINTS reward (real-world prize / title / profile) is returned so we can tell them what they won.
  app.post("/api/points/checkin", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const { checkinDays, leaveDays } = await load(me.id);
    const t = today();
    if (checkinDays.has(t)) { const { balance } = await load(me.id); return { already: true, balance, streak: streakEndingAt(t, checkinDays, leaveDays) }; }
    const newStreak = streakEndingAt(prevDay(t), checkinDays, leaveDays) + 1; // yesterday's run + today
    const [reward] = await db.select().from(checkinRewards).where(and(eq(checkinRewards.tenantId, me.tenantId), eq(checkinRewards.day, t)));
    const base = reward?.kind === "POINTS" ? reward.points : BASE;
    const delta = base + bonus(newStreak);
    await db.insert(pointsLedger).values({ tenantId: me.tenantId, userId: me.id, delta, reason: "checkin", createdDay: t });
    const { balance } = await load(me.id);
    const prize = reward && reward.kind !== "POINTS" ? { kind: reward.kind, label: reward.label } : null;
    return { awarded: delta, streak: newStreak, balance, checkedInToday: true, prize };
  });

  // Monthly check-in calendar: which days you checked in + each day's configured reward.
  app.get("/api/points/calendar", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const month = String((req.query as { month?: string }).month ?? today().slice(0, 7)).slice(0, 7);
    const [my, mm] = month.split("-").map(Number);
    const first = `${month}-01`;
    const nextFirst = new Date(Date.UTC(my, mm, 1)).toISOString().slice(0, 10); // 1st of the following month
    const checkins = (await db.select({ day: pointsLedger.createdDay }).from(pointsLedger).where(and(eq(pointsLedger.userId, me.id), eq(pointsLedger.reason, "checkin"), gte(pointsLedger.createdDay, first), lt(pointsLedger.createdDay, nextFirst)))).map((r) => r.day);
    const rewards = await db.select({ day: checkinRewards.day, kind: checkinRewards.kind, label: checkinRewards.label, points: checkinRewards.points }).from(checkinRewards).where(and(eq(checkinRewards.tenantId, me.tenantId), gte(checkinRewards.day, first), lt(checkinRewards.day, nextFirst)));
    const { balance, checkinDays, leaveDays } = await load(me.id);
    const t = today();
    return { month, today: t, balance, streak: streakEndingAt(checkinDays.has(t) ? t : prevDay(t), checkinDays, leaveDays), checkedInToday: checkinDays.has(t), canManage: await can(me, "reward.manage"), checkins, rewards };
  });

  // Set/clear a day's reward — gated by the dedicated reward.manage capability (not the calendar manager;
  // admins always). Fail-closed: only an admin or someone granted reward.manage can touch rewards.
  app.put("/api/points/rewards/:day", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    if (!(await can(me, "reward.manage"))) return reply.code(403).send({ error: "forbidden" });
    const day = z.string().date().safeParse((req.params as { day: string }).day);
    const body = z.object({ kind: z.enum(["POINTS", "PRIZE", "TITLE", "PROFILE"]), label: z.string().trim().min(1).max(120), points: z.number().int().min(0).max(100000).optional() }).safeParse(req.body);
    if (!day.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    await db.insert(checkinRewards).values({ tenantId: me.tenantId, day: day.data, kind: body.data.kind, label: body.data.label.trim(), points: body.data.points ?? 0 }).onConflictDoUpdate({ target: [checkinRewards.tenantId, checkinRewards.day], set: { kind: body.data.kind, label: body.data.label.trim(), points: body.data.points ?? 0 } });
    return { ok: true };
  });
  app.delete("/api/points/rewards/:day", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    if (!(await can(me, "reward.manage"))) return reply.code(403).send({ error: "forbidden" });
    const day = z.string().date().safeParse((req.params as { day: string }).day);
    if (!day.success) return reply.code(400).send({ error: "invalid_input" });
    await db.delete(checkinRewards).where(and(eq(checkinRewards.tenantId, me.tenantId), eq(checkinRewards.day, day.data)));
    return { ok: true };
  });

  // Daily lottery — one free random windfall per day (feeds the marketplace). Once/day via createdDay.
  app.post("/api/points/lottery", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const t = today();
    const [done] = await db.select({ id: pointsLedger.id }).from(pointsLedger).where(and(eq(pointsLedger.userId, me.id), eq(pointsLedger.reason, "lottery"), eq(pointsLedger.createdDay, t)));
    if (done) { const { balance } = await load(me.id); return { already: true, balance }; }
    const won = randomInt(5, 51); // 5–50 points
    await db.insert(pointsLedger).values({ tenantId: me.tenantId, userId: me.id, delta: won, reason: "lottery", createdDay: t });
    const { balance } = await load(me.id);
    return { won, balance, playedToday: true };
  });

  // Flag/unflag a day as leave/sick so it doesn't break the streak (toggle; defaults to today).
  app.post("/api/points/leave", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ day: z.string().date().optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const day = body.data.day ?? today();
    const where = and(eq(pointsLeaveDays.userId, me.id), eq(pointsLeaveDays.day, day));
    const [existing] = await db.select().from(pointsLeaveDays).where(where);
    if (existing) await db.delete(pointsLeaveDays).where(where);
    else await db.insert(pointsLeaveDays).values({ userId: me.id, day });
    return { onLeave: !existing, day };
  });
}
