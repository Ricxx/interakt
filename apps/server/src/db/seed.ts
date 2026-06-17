import { db } from "./client.js";
import { tenants, orgNodes } from "./schema.js";
import { seedDemoData } from "../lib/demoData.js";

// CLI demo seed. Run AFTER registering the first admin (registration creates the tenant).
const [tenant] = await db.select().from(tenants).limit(1);
if (!tenant) {
  console.error("No tenant yet. Register the first admin in the app, then re-run db:seed.");
  process.exit(1);
}
const existing = await db.select({ id: orgNodes.id }).from(orgNodes).limit(1);
if (existing.length) {
  console.error("Org already has structure — refusing to add demo data on top. Reset the DB to re-seed.");
  process.exit(1);
}

const result = await seedDemoData(tenant.id);
console.log(`Seeded ${result.nodes} org nodes and ${result.people} people for ${tenant.name}.`);
process.exit(0);
