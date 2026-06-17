import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { orgNodes, users } from "../db/schema.js";

// A node plus all its ancestors — the org levels that "contain" someone (team → dept → division → org).
export async function ancestorNodes(tenantId: string, nodeId: string | null): Promise<Set<string>> {
  const set = new Set<string>();
  if (!nodeId) return set;
  const nodes = await db.select({ id: orgNodes.id, parentId: orgNodes.parentId }).from(orgNodes).where(eq(orgNodes.tenantId, tenantId));
  const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
  let cur: string | null = nodeId;
  let guard = 0;
  while (cur && guard++ < 30) {
    set.add(cur);
    cur = parent.get(cur) ?? null;
  }
  return set;
}

export async function userNodeId(userId: string): Promise<string | null> {
  const [u] = await db.select({ nodeId: users.nodeId }).from(users).where(eq(users.id, userId));
  return u?.nodeId ?? null;
}
