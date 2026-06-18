import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, orgNodes, recognitions, recognitionLikes } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";

// A person's public profile card — shown as an overlay anywhere a name is clicked. Today it's
// identity + the recognition they've received; later this is where awards/trinkets/achievements
// from a marketplace will hang. Recognition is attributed by design, so showing it here is fine;
// we still only surface the items the *viewer* is in scope to see.
export function profileRoutes(app: FastifyInstance) {
  app.get("/api/profile/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [u] = await db
      .select({ id: users.id, name: users.displayName, jobTitle: users.jobTitle, role: users.role, dept: orgNodes.name })
      .from(users)
      .leftJoin(orgNodes, eq(orgNodes.id, users.nodeId))
      .where(and(eq(users.id, id.data), eq(users.tenantId, me.tenantId)));
    if (!u) return reply.code(404).send({ error: "not_found" });

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
    return { id: u.id, name: u.name, jobTitle: u.jobTitle, dept: u.dept, role: u.role, received, totalReceived: received.length, totalStars };
  });
}
