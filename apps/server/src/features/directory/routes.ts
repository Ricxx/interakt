import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, orgNodes } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";

// People directory — a read-only "find a colleague" list for everyone (the Members page is
// admin-only and for editing). Returns active people in the tenant with the public-facing
// profile bits; search + department filtering happen on the client (pilot scale ~2k people).

export function directoryRoutes(app: FastifyInstance) {
  app.get("/api/directory", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db
      .select({
        id: users.id,
        name: users.displayName,
        jobTitle: users.jobTitle,
        avatarUrl: users.avatarUrl,
        statusText: users.statusText,
        flair: users.flair,
        nodeId: users.nodeId,
        dept: orgNodes.name,
      })
      .from(users)
      .leftJoin(orgNodes, eq(users.nodeId, orgNodes.id))
      .where(and(eq(users.tenantId, me.tenantId), eq(users.status, "ACTIVE")))
      .orderBy(asc(users.displayName));
    // Departments present in the list, for the filter dropdown.
    const depts = [...new Map(rows.filter((r) => r.nodeId).map((r) => [r.nodeId!, r.dept!])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { people: rows, departments: depts };
  });
}
