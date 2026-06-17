import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth.js";
import { peopleInScope } from "../../lib/scope.js";

// People in a scope. Priority: groupId (custom group) > nodeId (org subtree) > all.
export function randomizerRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { nodeId?: string; groupId?: string } }>(
    "/api/randomizer/pool",
    { preHandler: requireAuth },
    async (req) => {
      const tenantId = req.currentUser!.tenantId;
      const { nodeId, groupId } = req.query;
      const people = groupId
        ? await peopleInScope(tenantId, "GROUP", groupId)
        : !nodeId || nodeId === "all"
          ? await peopleInScope(tenantId, "ALL", null)
          : await peopleInScope(tenantId, "NODE", nodeId);
      return { people };
    },
  );
}
