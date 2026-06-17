import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env.js";

// Deploy step: apply any pending forward-only migrations from ./drizzle.
// Safe to run on every boot — already-applied migrations are skipped. A brand-new
// database gets the full schema from 0000; an existing one only gets what's newer.
async function main() {
  // Quiet the "schema/relation already exists, skipping" NOTICEs from the migrator's
  // own bookkeeping table so deploy logs only show real output.
  const sql = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
  console.log("Migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
