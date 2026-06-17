import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { groupMembers, groups, orgNodes, users } from "../db/schema.js";

// A "scoped thing" — a board, a list, anything visible to a slice of the org.
export type Scope = { tenantId: string; scopeKind: string; scopeId: string | null };

// Can this user see it? ALL = everyone in the company; GROUP = group members;
// NODE = anyone whose home node is that node or under it (a division → all its depts).
export async function canSeeScoped(scope: Scope, userId: string, tenantId: string): Promise<boolean> {
  if (scope.tenantId !== tenantId) return false;
  if (scope.scopeKind === "ALL") return true;

  if (scope.scopeKind === "GROUP" && scope.scopeId) {
    const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, scope.scopeId), eq(groupMembers.userId, userId)));
    return !!m;
  }

  if (scope.scopeKind === "NODE" && scope.scopeId) {
    const [target] = await db.select({ path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.id, scope.scopeId));
    if (!target) return false;
    const [u] = await db.select({ nodeId: users.nodeId }).from(users).where(eq(users.id, userId));
    if (!u?.nodeId) return false; // user not placed in the tree → can't see node-scoped things
    const [un] = await db.select({ path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.id, u.nodeId));
    if (!un) return false;
    return un.path === target.path || un.path.startsWith(`${target.path}.`);
  }
  return false;
}

// Human label for a scope: "Org-wide" / department name / group name.
export async function scopeLabel(tenantId: string, scopeKind: string, scopeId: string | null): Promise<string> {
  if (scopeKind === "NODE" && scopeId) {
    const [n] = await db.select({ name: orgNodes.name }).from(orgNodes).where(and(eq(orgNodes.id, scopeId), eq(orgNodes.tenantId, tenantId)));
    return n?.name ?? "Department";
  }
  if (scopeKind === "GROUP" && scopeId) {
    const [g] = await db.select({ name: groups.name }).from(groups).where(and(eq(groups.id, scopeId), eq(groups.tenantId, tenantId)));
    return g?.name ?? "Group";
  }
  return "Org-wide";
}
