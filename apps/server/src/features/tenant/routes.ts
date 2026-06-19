import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { tenants } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";

// Is this a real IANA timezone? Intl throws on an unknown zone — cheap, robust validation.
function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

export function tenantRoutes(app: FastifyInstance) {
  // Anyone can read workspace settings — the timezone is needed to render scheduled times correctly.
  app.get("/api/tenant/settings", { preHandler: requireAuth }, async (req) => {
    const [t] = await db.select({ name: tenants.name, timezone: tenants.timezone, registrationMode: tenants.registrationMode, usageLogEnabled: tenants.usageLogEnabled, profilePicsEnabled: tenants.profilePicsEnabled }).from(tenants).where(eq(tenants.id, req.currentUser!.tenantId));
    return t ?? { name: "", timezone: "UTC", registrationMode: "INVITE_ONLY", usageLogEnabled: false, profilePicsEnabled: true };
  });

  // Admin: workspace settings — timezone (drives scheduled-time displays) and the usage-log toggle.
  app.patch("/api/tenant/settings", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = z.object({ timezone: z.string().min(1).max(64).optional(), usageLogEnabled: z.boolean().optional(), profilePicsEnabled: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (body.data.timezone !== undefined && !validTz(body.data.timezone)) return reply.code(400).send({ error: "invalid_timezone" });
    const me = req.currentUser!;
    const patch: Record<string, unknown> = {};
    if (body.data.timezone !== undefined) patch.timezone = body.data.timezone;
    if (body.data.usageLogEnabled !== undefined) patch.usageLogEnabled = body.data.usageLogEnabled;
    if (body.data.profilePicsEnabled !== undefined) patch.profilePicsEnabled = body.data.profilePicsEnabled;
    if (!Object.keys(patch).length) return { ok: true };
    await db.update(tenants).set(patch).where(eq(tenants.id, me.tenantId));
    await recordAudit({ action: "tenant.settings_changed", tenantId: me.tenantId, actorId: me.id, meta: patch });
    return { ok: true };
  });
}
