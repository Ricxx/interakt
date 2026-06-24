import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, like, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pointsLedger, recognitions, achievementAwards, achievements, notificationReads } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";

// Display labels for the preset recognition badges (keys mirror recognition/routes.ts).
const BADGE_LABEL: Record<string, string> = {
  "team-player": "Team Player 🤝", "above-beyond": "Above & Beyond 🚀", "helping-hand": "Helping Hand 🙌",
  "bright-idea": "Bright Idea 💡", "customer-hero": "Customer Hero ⭐", "great-attitude": "Great Attitude 😊",
};
const badgeLabel = (k: string) => BADGE_LABEL[k] ?? "recognition 🎉";

// Notifications inbox — a single place to see "things that happened for you". The feed is
// DERIVED at read time by merging a few existing tables (points gifts, recognitions you
// received, achievements you earned); nothing writes a notification row, so no feature has
// to be touched. Unread = items newer than the last time you opened the inbox.

type Notif = { id: string; kind: "GIFT" | "RECOGNITION" | "ACHIEVEMENT"; icon: string; title: string; body: string; at: string };

export function notificationsRoutes(app: FastifyInstance) {
  async function feed(userId: string, tenantId: string): Promise<Notif[]> {
    const items: Notif[] = [];

    // Points gifts received — the credit row a colleague's gift wrote to my ledger.
    const gifts = await db
      .select({ id: pointsLedger.id, delta: pointsLedger.delta, reason: pointsLedger.reason, at: pointsLedger.createdAt })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.userId, userId), gt(pointsLedger.delta, 0), like(pointsLedger.reason, "Gift from%")))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(30);
    for (const g of gifts) items.push({ id: `gift:${g.id}`, kind: "GIFT", icon: "🎁", title: `+${g.delta} points gift`, body: g.reason, at: g.at.toISOString() });

    // Recognition addressed directly to me (the broadcast NODE/GROUP ones live on the
    // Recognition wall; here we surface only the personal "someone recognised you" ones).
    const recs = await db
      .select({ id: recognitions.id, badge: recognitions.badge, message: recognitions.message, at: recognitions.createdAt })
      .from(recognitions)
      .where(and(eq(recognitions.tenantId, tenantId), eq(recognitions.recipientType, "USER"), eq(recognitions.toUserId, userId), sql`${recognitions.fromUserId} <> ${userId}`))
      .orderBy(desc(recognitions.createdAt))
      .limit(30);
    for (const r of recs) items.push({ id: `rec:${r.id}`, kind: "RECOGNITION", icon: "🎉", title: `You got a ${badgeLabel(r.badge)}`, body: r.message, at: r.at.toISOString() });

    // Achievements I unlocked.
    const awards = await db
      .select({ id: achievementAwards.id, icon: achievements.icon, name: achievements.name, at: achievementAwards.awardedAt })
      .from(achievementAwards)
      .innerJoin(achievements, eq(achievements.id, achievementAwards.achievementId))
      .where(eq(achievementAwards.userId, userId))
      .orderBy(desc(achievementAwards.awardedAt))
      .limit(30);
    for (const a of awards) items.push({ id: `ach:${a.id}`, kind: "ACHIEVEMENT", icon: a.icon || "🏆", title: "Achievement unlocked", body: a.name, at: a.at.toISOString() });

    return items.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, 40);
  }

  app.get("/api/notifications", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const [read] = await db.select({ at: notificationReads.lastSeenAt }).from(notificationReads).where(eq(notificationReads.userId, me.id));
    const since = read?.at ?? new Date(0);
    const items = await feed(me.id, me.tenantId);
    const unread = items.filter((i) => new Date(i.at) > since).length;
    return { items, unread, lastSeenAt: since.toISOString() };
  });

  // Just the unread count — cheap enough to poll for the nav bell.
  app.get("/api/notifications/unread", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const [read] = await db.select({ at: notificationReads.lastSeenAt }).from(notificationReads).where(eq(notificationReads.userId, me.id));
    const since = read?.at ?? new Date(0);
    const items = await feed(me.id, me.tenantId);
    return { count: items.filter((i) => new Date(i.at) > since).length };
  });

  app.post("/api/notifications/read", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    await db.insert(notificationReads).values({ userId: me.id, lastSeenAt: new Date() }).onConflictDoUpdate({ target: notificationReads.userId, set: { lastSeenAt: new Date() } });
    return { ok: true };
  });
}
