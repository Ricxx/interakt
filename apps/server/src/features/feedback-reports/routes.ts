import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { bugReports, users } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { sendEmail } from "../../lib/email.js";
import { env } from "../../env.js";

// Bug reports & ideas from the footer. They land with the workspace (server) admin, who triages and
// can forward the good ones to the vendor (the product maker). A plain support channel — not anonymous.
export function feedbackReportRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole("TENANT_ADMIN") };

  app.post("/api/bug-reports", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ kind: z.enum(["BUG", "IDEA"]), message: z.string().trim().min(3).max(4000), page: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    await db.insert(bugReports).values({ tenantId: me.tenantId, reporterId: me.id, kind: body.data.kind, message: body.data.message, page: body.data.page || null });
    return { ok: true };
  });

  app.get("/api/bug-reports", admin, async (req) => {
    const me = req.currentUser!;
    const reporter = users;
    const rows = await db
      .select({ id: bugReports.id, kind: bugReports.kind, message: bugReports.message, page: bugReports.page, status: bugReports.status, at: bugReports.createdAt, by: reporter.displayName })
      .from(bugReports).innerJoin(reporter, eq(reporter.id, bugReports.reporterId))
      .where(eq(bugReports.tenantId, me.tenantId)).orderBy(desc(bugReports.createdAt));
    return { items: rows.map((r) => ({ ...r, at: r.at.toISOString() })) };
  });

  app.get("/api/bug-reports/count", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    if (me.role !== "TENANT_ADMIN") return { count: 0, canView: false };
    const rows = await db.select({ id: bugReports.id }).from(bugReports).where(and(eq(bugReports.tenantId, me.tenantId), eq(bugReports.status, "NEW")));
    return { count: rows.length, canView: true };
  });

  app.post<{ Params: { id: string } }>("/api/bug-reports/:id/forward", admin, async (req, reply) => {
    const me = req.currentUser!;
    const [r] = await db.select().from(bugReports).where(and(eq(bugReports.id, (req.params as { id: string }).id), eq(bugReports.tenantId, me.tenantId)));
    if (!r) return reply.code(404).send({ error: "not_found" });
    await db.update(bugReports).set({ status: "FORWARDED", handledBy: me.id, handledAt: new Date() }).where(eq(bugReports.id, r.id));
    if (env.vendorEmail) {
      await sendEmail({ to: env.vendorEmail, subject: `[CES ${r.kind}] forwarded by an admin`, html: `<p><b>${r.kind}</b> on page <code>${r.page ?? "?"}</code></p><p>${r.message.replace(/</g, "&lt;")}</p>` }).catch(() => {});
    }
    await recordAudit({ action: "bug.forwarded", tenantId: me.tenantId, actorId: me.id, meta: { id: r.id, emailed: !!env.vendorEmail } });
    return { ok: true, emailed: !!env.vendorEmail };
  });

  app.post<{ Params: { id: string } }>("/api/bug-reports/:id/close", admin, async (req, reply) => {
    const me = req.currentUser!;
    const [r] = await db.select().from(bugReports).where(and(eq(bugReports.id, (req.params as { id: string }).id), eq(bugReports.tenantId, me.tenantId)));
    if (!r) return reply.code(404).send({ error: "not_found" });
    await db.update(bugReports).set({ status: "CLOSED", handledBy: me.id, handledAt: new Date() }).where(eq(bugReports.id, r.id));
    return { ok: true };
  });
}
