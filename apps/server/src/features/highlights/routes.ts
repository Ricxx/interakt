import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { recognitions, achievementAwards, achievements, events, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";

// Team Memories / Highlights — a celebratory, read-only timeline of nice things that happened
// across the org. DERIVED at read time (like the notifications inbox); no new write paths. To stay
// fast and leak-proof we only surface ORG-WIDE (scopeKind='ALL') items — already visible to everyone —
// so no per-user scope checks are needed. Anonymous channels (suggestions/wellness) are never sourced.

const BADGE_LABEL: Record<string, string> = {
  "team-player": "Team Player 🤝", "above-beyond": "Above & Beyond 🚀", "helping-hand": "Helping Hand 🙌",
  "bright-idea": "Bright Idea 💡", "customer-hero": "Customer Hero ⭐", "great-attitude": "Great Attitude 😊",
};
const EVENT_ICON: Record<string, string> = { THEME_DAY: "🎉", PLAN: "📅", FUND: "💰" };
const EVENT_WORD: Record<string, string> = { THEME_DAY: "Theme day", PLAN: "Event", FUND: "Fundraiser" };

type Item = { id: string; kind: "RECOGNITION" | "ACHIEVEMENT" | "EVENT"; icon: string; title: string; body: string; at: string };

export function highlightsRoutes(app: FastifyInstance) {
  app.get("/api/highlights", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const items: Item[] = [];

    // Org-wide recognitions to a person.
    const recs = await db
      .select({ id: recognitions.id, badge: recognitions.badge, message: recognitions.message, at: recognitions.createdAt, name: users.displayName })
      .from(recognitions)
      .innerJoin(users, eq(users.id, recognitions.toUserId))
      .where(and(eq(recognitions.tenantId, me.tenantId), eq(recognitions.scopeKind, "ALL"), eq(recognitions.recipientType, "USER")))
      .orderBy(desc(recognitions.createdAt))
      .limit(40);
    for (const r of recs) items.push({ id: `rec:${r.id}`, kind: "RECOGNITION", icon: "🎉", title: `${r.name} got a ${BADGE_LABEL[r.badge] ?? "shout-out"}`, body: r.message, at: r.at.toISOString() });

    // Org-wide achievements unlocked.
    const awards = await db
      .select({ id: achievementAwards.id, icon: achievements.icon, achName: achievements.name, at: achievementAwards.awardedAt, name: users.displayName })
      .from(achievementAwards)
      .innerJoin(achievements, eq(achievements.id, achievementAwards.achievementId))
      .innerJoin(users, eq(users.id, achievementAwards.userId))
      .where(and(eq(achievementAwards.tenantId, me.tenantId), eq(achievements.scopeKind, "ALL")))
      .orderBy(desc(achievementAwards.awardedAt))
      .limit(40);
    for (const a of awards) items.push({ id: `ach:${a.id}`, kind: "ACHIEVEMENT", icon: a.icon || "🏆", title: `${a.name} unlocked ${a.achName}`, body: "", at: a.at.toISOString() });

    // Org-wide events / theme days.
    const evs = await db
      .select({ id: events.id, kind: events.kind, title: events.title, instructions: events.instructions, at: events.createdAt })
      .from(events)
      .where(and(eq(events.tenantId, me.tenantId), eq(events.scopeKind, "ALL")))
      .orderBy(desc(events.createdAt))
      .limit(40);
    for (const e of evs) items.push({ id: `ev:${e.id}`, kind: "EVENT", icon: EVENT_ICON[e.kind] ?? "📌", title: `${EVENT_WORD[e.kind] ?? "Event"}: ${e.title}`, body: (e.instructions ?? "").slice(0, 160), at: e.at.toISOString() });

    items.sort((x, y) => (x.at < y.at ? 1 : -1));
    return { items: items.slice(0, 60) };
  });
}
