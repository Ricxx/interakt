import { and, eq, like, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { groups, groupMembers, orgNodes, users } from "../db/schema.js";

export type Person = { id: string; name: string; node: string | null };

// People in an audience scope. Shared by the randomizer and session invites.
//   ALL   -> everyone in the company
//   NODE  -> everyone whose home node is that node or anything under it
//   GROUP -> the group's members
export async function peopleInScope(
  tenantId: string,
  scopeKind: "ALL" | "NODE" | "GROUP",
  scopeId: string | null,
): Promise<Person[]> {
  if (scopeKind === "GROUP" && scopeId) {
    const [g] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, scopeId), eq(groups.tenantId, tenantId)));
    if (!g) return [];
    return db
      .select({ id: users.id, name: users.displayName, node: orgNodes.name })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .leftJoin(orgNodes, eq(users.nodeId, orgNodes.id))
      .where(eq(groupMembers.groupId, scopeId))
      .orderBy(users.displayName);
  }

  const base = db
    .select({ id: users.id, name: users.displayName, node: orgNodes.name })
    .from(users)
    .leftJoin(orgNodes, eq(users.nodeId, orgNodes.id));

  if (scopeKind === "NODE" && scopeId) {
    const [node] = await db
      .select({ path: orgNodes.path })
      .from(orgNodes)
      .where(and(eq(orgNodes.id, scopeId), eq(orgNodes.tenantId, tenantId)))
      .limit(1);
    if (!node) return [];
    return base
      .where(and(eq(users.tenantId, tenantId), or(eq(orgNodes.path, node.path), like(orgNodes.path, `${node.path}.%`))))
      .orderBy(users.displayName);
  }

  return base.where(eq(users.tenantId, tenantId)).orderBy(users.displayName);
}
