import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { retentionSettings } from "../../db/schema.js";
import { requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { runRetentionForTenant } from "./job.js";

const DEFAULTS = { enabled: false, complaintsResolvedMonths: 12, wellnessRawDays: 90, deactivatedPiiDays: 60 };

// Data-retention schedule — tenant-admin only. Disabled by default; nothing is ever auto-deleted until
// an admin turns it on. Audit/ledger tables are never auto-purged (kept for accountability).
export function retentionRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole("TENANT_ADMIN") };

  async function load(tenantId: string) {
    const [s] = await db.select().from(retentionSettings).where(eq(retentionSettings.tenantId, tenantId));
    return s ?? { tenantId, ...DEFAULTS, lastRunAt: null };
  }

  app.get("/api/retention", admin, async (req) => {
    const s = await load(req.currentUser!.tenantId);
    return { ...s, lastRunAt: s.lastRunAt instanceof Date ? s.lastRunAt.toISOString() : s.lastRunAt };
  });

  app.put("/api/retention", admin, async (req, reply) => {
    const body = z.object({
      enabled: z.boolean().optional(),
      complaintsResolvedMonths: z.number().int().min(1).max(120).optional(),
      wellnessRawDays: z.number().int().min(7).max(3650).optional(),
      deactivatedPiiDays: z.number().int().min(0).max(3650).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const cur = await load(me.tenantId);
    const next = { tenantId: me.tenantId, enabled: cur.enabled, complaintsResolvedMonths: cur.complaintsResolvedMonths, wellnessRawDays: cur.wellnessRawDays, deactivatedPiiDays: cur.deactivatedPiiDays, ...body.data };
    await db.insert(retentionSettings).values(next).onConflictDoUpdate({ target: retentionSettings.tenantId, set: next });
    await recordAudit({ action: "retention.settings_changed", tenantId: me.tenantId, actorId: me.id, meta: body.data });
    return { ok: true };
  });

  // Run the purge now (instead of waiting for the daily tick) — handy after changing the schedule.
  app.post("/api/retention/run", admin, async (req, reply) => {
    const me = req.currentUser!;
    const result = await runRetentionForTenant(me.tenantId);
    if (!result) return reply.code(400).send({ error: "retention_disabled" });
    return { ok: true, ...result };
  });
}
