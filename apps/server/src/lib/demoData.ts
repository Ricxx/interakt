import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { createOrgNode } from "./org.js";

// Demo org tree + directory-only people. Shared by the CLI seed and the admin
// "Load demo data" button. Caller must ensure the org is empty first.
export async function seedDemoData(tenantId: string) {
  const sales = await createOrgNode(tenantId, { name: "Sales", nodeType: "DIVISION", parentId: null });
  const east = await createOrgNode(tenantId, { name: "East Region", nodeType: "DEPARTMENT", parentId: sales.id });
  const west = await createOrgNode(tenantId, { name: "West Region", nodeType: "DEPARTMENT", parentId: sales.id });
  const eng = await createOrgNode(tenantId, { name: "Engineering", nodeType: "DIVISION", parentId: null });
  const plat = await createOrgNode(tenantId, { name: "Platform", nodeType: "DEPARTMENT", parentId: eng.id });
  const mobile = await createOrgNode(tenantId, { name: "Mobile", nodeType: "DEPARTMENT", parentId: eng.id });

  const people: Array<[string, string]> = [
    ["Ava Bennett", east.id],
    ["Liam Carter", east.id],
    ["Noah Diaz", east.id],
    ["Mia Foster", west.id],
    ["Ethan Grant", west.id],
    ["Sophia Hayes", plat.id],
    ["Lucas Ingram", plat.id],
    ["Olivia Jones", plat.id],
    ["Mason Kelly", mobile.id],
    ["Emma Lopez", mobile.id],
    ["James Nguyen", mobile.id],
    ["Isla Owens", plat.id],
  ];
  let i = 0;
  for (const [name, nodeId] of people) {
    await db.insert(users).values({
      tenantId,
      nodeId,
      email: `demo${i++}@demo.local`,
      displayName: name,
      role: "MEMBER",
    });
  }
  return { nodes: 6, people: people.length };
}
