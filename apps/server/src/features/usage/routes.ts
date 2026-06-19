import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { tenants, sessions, sessionParticipants, activities, orgNodes, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { hasScope } from "../../lib/capabilities.js";
import { userNodeId } from "../../lib/orgScope.js";

// The usage log is OVERSIGHT, so it's intentionally fail-closed (no ungoverned "open" fallback) and
// content-free. It reads ONLY who joined which sessions + what activity TYPES ran — never any content,
// and NEVER touches anonymity-critical data (wellness check-ins, anonymous surveys, anonymous kudos).
const WINDOW_DAYS = 30;

type Me = { id: string; tenantId: string; role: string; nodeId?: string | null };

// Reach for the usage log: admin/ORG → everyone; NODE → the viewer's own subtree; else no access.
async function usageReach(me: Me): Promise<"ALL" | "NODE" | null> {
  if (await hasScope(me, "usage.view", "ORG")) return "ALL"; // admins always pass hasScope
  if (await hasScope(me, "usage.view", "NODE")) return "NODE";
  return null;
}
async function enabled(tenantId: string): Promise<boolean> {
  const [t] = await db.select({ on: tenants.usageLogEnabled }).from(tenants).where(eq(tenants.id, tenantId));
  return !!t?.on;
}

export function usageRoutes(app: FastifyInstance) {
  // Lightweight check so the nav can show the link only to people who can actually use it.
  app.get("/api/usage/access", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    return { canView: (await usageReach(me)) !== null, enabled: await enabled(me.tenantId) };
  });

  app.get("/api/usage", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const reach = await usageReach(me);
    if (!reach) return reply.code(403).send({ error: "forbidden" });
    if (!(await enabled(me.tenantId))) return { enabled: false, sessions: [] };

    // Who is "in reach" — the people whose activity this viewer is allowed to see.
    let inReach: string[];
    if (reach === "ALL") {
      inReach = (await db.select({ id: users.id }).from(users).where(eq(users.tenantId, me.tenantId))).map((u) => u.id);
    } else {
      const myNode = me.nodeId ?? (await userNodeId(me.id)); // currentUser doesn't carry nodeId
      if (!myNode) inReach = [me.id];
      else {
        const [home] = await db.select({ path: orgNodes.path }).from(orgNodes).where(and(eq(orgNodes.id, myNode), eq(orgNodes.tenantId, me.tenantId)));
        const subtree = home ? (await db.select({ id: orgNodes.id, path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.tenantId, me.tenantId))).filter((n) => n.path === home.path || n.path.startsWith(`${home.path}.`)).map((n) => n.id) : [];
        inReach = subtree.length ? (await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, me.tenantId), inArray(users.nodeId, subtree)))).map((u) => u.id) : [me.id];
      }
    }
    if (!inReach.length) return { enabled: true, sessions: [] };

    // Sessions in the window that had ≥1 in-reach participant who actually joined.
    const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
    const rows = await db
      .select({ sessionId: sessions.id, title: sessions.title, createdAt: sessions.createdAt, userId: sessionParticipants.userId, name: users.displayName })
      .from(sessionParticipants)
      .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
      .innerJoin(users, eq(users.id, sessionParticipants.userId))
      .where(and(eq(sessions.tenantId, me.tenantId), gte(sessions.createdAt, cutoff), eq(sessionParticipants.state, "JOINED"), inArray(sessionParticipants.userId, inReach)))
      .orderBy(desc(sessions.createdAt));

    const bySession = new Map<string, { id: string; title: string; day: string; people: string[] }>();
    for (const r of rows) {
      const s = bySession.get(r.sessionId) ?? { id: r.sessionId, title: r.title, day: r.createdAt.toISOString().slice(0, 10), people: [] };
      if (!s.people.includes(r.name)) s.people.push(r.name);
      bySession.set(r.sessionId, s);
    }
    const sids = [...bySession.keys()];
    const acts = new Map<string, Set<string>>();
    if (sids.length) for (const a of await db.select({ sessionId: activities.sessionId, type: activities.type }).from(activities).where(inArray(activities.sessionId, sids))) {
      acts.set(a.sessionId, (acts.get(a.sessionId) ?? new Set()).add(a.type));
    }
    const list = [...bySession.values()].slice(0, 50).map((s) => ({ ...s, activities: [...(acts.get(s.id) ?? new Set())] }));
    return { enabled: true, reach, sessions: list };
  });
}
