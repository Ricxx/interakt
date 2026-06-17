import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

// The running app uses the restricted role; migrations/seed/provisioning use the owner URL.
const sql = postgres(env.appDatabaseUrl);
export const db = drizzle(sql, { schema });
