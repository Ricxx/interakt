import postgres from "postgres";
import { env } from "../env.js";

// Provisioning step (run as the owner, once per deployment, after migrations).
// Creates/updates the least-privilege role the app connects as: full DML on normal
// tables, but NO UPDATE/DELETE/TRUNCATE on append-only tables. The role name + password
// come from APP_DATABASE_URL, so that one connection string is the single source of truth.
//
// Defense-in-depth alongside the append-only triggers (migration 0001): the triggers stop
// mutations from any role; this stops the app's role from even being granted the right.

// Tables that are append-only (CLAUDE.md). Add new ones here AND give them a trigger.
const APPEND_ONLY = ["audit_log", "event_contributions", "points_ledger"];

async function main() {
  if (!process.env.APP_DATABASE_URL) {
    console.error("Set APP_DATABASE_URL (the restricted role's connection string) before provisioning.");
    process.exit(1);
  }
  const url = new URL(env.appDatabaseUrl);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const owner = decodeURIComponent(new URL(env.databaseUrl).username);
  const safeName = /^[a-z_][a-z0-9_]*$/;
  if (!safeName.test(role) || !safeName.test(owner)) {
    console.error(`Refusing unsafe role name: ${safeName.test(role) ? owner : role}`);
    process.exit(1);
  }
  if (!password) {
    console.error("APP_DATABASE_URL must include a password for the app role.");
    process.exit(1);
  }

  // Connect as the owner to run the DDL.
  const sql = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
  const pw = password.replace(/'/g, "''"); // escape for the role literal

  const [exists] = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${role}`;
  if (exists) {
    await sql.unsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD '${pw}'`);
  } else {
    await sql.unsafe(`CREATE ROLE ${role} WITH LOGIN PASSWORD '${pw}'`);
  }

  // Least privilege: schema access + full DML on existing tables/sequences...
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  // ...and the same automatically for tables/sequences future migrations create (as owner).
  await sql.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
  await sql.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);

  // Take back the dangerous rights on append-only tables.
  for (const t of APPEND_ONLY) {
    await sql.unsafe(`REVOKE UPDATE, DELETE, TRUNCATE ON ${t} FROM ${role}`);
  }

  await sql.end();
  console.log(`Provisioned restricted role "${role}" (no UPDATE/DELETE on: ${APPEND_ONLY.join(", ")}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
