import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, orgNodes, pointsLedger, recognitions, achievementAwards, achievements, groupMembers, groups, eventContributions, events } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";

// Right of access (GDPR Art 15 / Jamaica DPA / CCPA): let a person download everything CES holds that
// is LINKED to them. Anonymous artifacts (suggestions, complaints, wellness check-ins) are deliberately
// excluded — they carry no identity, so we genuinely cannot attribute them to anyone (that's the point
// of FORCED_ANON, and is the correct, honest answer to a subject-access request).
export function privacyRoutes(app: FastifyInstance) {
  app.get("/api/me/export", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;

    const [u] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, jobTitle: users.jobTitle, statusText: users.statusText, hobbies: users.hobbies, highSchool: users.highSchool, role: users.role, status: users.status, dept: orgNodes.name, createdAt: users.createdAt })
      .from(users).leftJoin(orgNodes, eq(users.nodeId, orgNodes.id))
      .where(eq(users.id, me.id));

    const points = await db.select({ delta: pointsLedger.delta, reason: pointsLedger.reason, day: pointsLedger.createdDay }).from(pointsLedger).where(eq(pointsLedger.userId, me.id)).orderBy(desc(pointsLedger.createdAt));
    const balance = points.reduce((s, p) => s + p.delta, 0);

    const recvd = await db.select({ badge: recognitions.badge, message: recognitions.message, at: recognitions.createdAt }).from(recognitions).where(and(eq(recognitions.tenantId, me.tenantId), eq(recognitions.recipientType, "USER"), eq(recognitions.toUserId, me.id))).orderBy(desc(recognitions.createdAt));
    const given = await db.select({ badge: recognitions.badge, message: recognitions.message, at: recognitions.createdAt }).from(recognitions).where(eq(recognitions.fromUserId, me.id)).orderBy(desc(recognitions.createdAt));

    const awards = await db.select({ name: achievements.name, at: achievementAwards.awardedAt }).from(achievementAwards).innerJoin(achievements, eq(achievements.id, achievementAwards.achievementId)).where(eq(achievementAwards.userId, me.id)).orderBy(desc(achievementAwards.awardedAt));

    const myGroups = await db.select({ name: groups.name }).from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(eq(groupMembers.userId, me.id));

    const contributions = await db.select({ event: events.title, amount: eventContributions.amount, note: eventContributions.note, at: eventContributions.createdAt }).from(eventContributions).innerJoin(events, eq(events.id, eventContributions.eventId)).where(eq(eventContributions.userId, me.id)).orderBy(desc(eventContributions.createdAt));

    return {
      _about: "Everything CES holds that is linked to your account. Anonymous submissions (suggestions, complaints, wellness check-ins) are not included because they carry no identity and cannot be attributed to you.",
      profile: u,
      points: { balance, ledger: points },
      recognition: { received: recvd, given },
      achievements: awards,
      groups: myGroups.map((g) => g.name),
      contributions,
    };
  });
}
