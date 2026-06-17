import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { orgNodes } from "../db/schema.js";

// Create an org node. `path` is parent.path + a random segment, so subtree prefix
// queries work and we never have to dedupe human-readable slugs. Used by the org
// manager route and the demo-data seeder.
export async function createOrgNode(
  tenantId: string,
  args: { name: string; nodeType: string; parentId: string | null },
) {
  let parentPath: string | null = null;
  if (args.parentId) {
    const [parent] = await db
      .select({ path: orgNodes.path })
      .from(orgNodes)
      .where(and(eq(orgNodes.id, args.parentId), eq(orgNodes.tenantId, tenantId)));
    if (!parent) throw new Error("invalid_parent");
    parentPath = parent.path;
  }
  const seg = randomBytes(4).toString("hex");
  const path = parentPath ? `${parentPath}.${seg}` : seg;
  const [node] = await db
    .insert(orgNodes)
    .values({ tenantId, parentId: args.parentId, nodeType: args.nodeType, name: args.name, path })
    .returning();
  return node;
}
