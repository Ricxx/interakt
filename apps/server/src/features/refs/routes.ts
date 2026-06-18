import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { lists } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { canSeeScoped } from "../../lib/scopeAccess.js";

// Resolve references pasted into comments/chat to a safe preview. Permission-checked:
// the title is returned ONLY if the caller may see the thing — otherwise accessible:false
// with a null title, so a reference can never leak a name to someone outside its scope.
const body = z.object({
  refs: z.array(z.object({ kind: z.enum(["list"]), id: z.string().uuid() })).max(50),
});

export function refRoutes(app: FastifyInstance) {
  app.post("/api/refs/resolve", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const out: { kind: string; id: string; title: string | null; accessible: boolean }[] = [];

    const listIds = [...new Set(parsed.data.refs.filter((r) => r.kind === "list").map((r) => r.id))];
    if (listIds.length) {
      const rows = await db.select().from(lists).where(and(eq(lists.tenantId, me.tenantId), inArray(lists.id, listIds)));
      const byId = new Map(rows.map((l) => [l.id, l]));
      for (const id of listIds) {
        const l = byId.get(id);
        const accessible = !!l && (await canSeeScoped(l, me.id, me.tenantId));
        out.push({ kind: "list", id, title: accessible ? l!.title : null, accessible });
      }
    }
    return { refs: out };
  });
}
