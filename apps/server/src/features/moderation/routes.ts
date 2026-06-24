import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contentReports, eventPhotos, suggestions, events, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { can } from "../../lib/capabilities.js";

// Lightweight moderation: anyone can report a gallery photo or a public suggestion; people with
// content.moderate work an OPEN-report queue and either HIDE the content or DISMISS the report.
// Hidden content stops rendering for everyone. Anonymous artifacts keep their anonymity — a report
// references the suggestion id only, never the (non-existent) author.
export function moderationRoutes(app: FastifyInstance) {
  // Confirm the reported content exists in this tenant (and grab a preview for the queue).
  async function lookup(tenantId: string, kind: string, refId: string) {
    if (kind === "PHOTO") {
      const [p] = await db.select({ url: eventPhotos.url, caption: eventPhotos.caption, hidden: eventPhotos.hidden })
        .from(eventPhotos).innerJoin(events, eq(events.id, eventPhotos.eventId))
        .where(and(eq(eventPhotos.id, refId), eq(events.tenantId, tenantId)));
      return p ? { preview: p.url, caption: p.caption ?? "", hidden: p.hidden } : null;
    }
    const [s] = await db.select({ body: suggestions.body, hidden: suggestions.hidden, kind: suggestions.kind })
      .from(suggestions).where(and(eq(suggestions.id, refId), eq(suggestions.tenantId, tenantId)));
    if (!s || s.kind !== "SUGGESTION") return null; // only public suggestions are reportable here
    return { preview: s.body, caption: "", hidden: s.hidden };
  }

  app.post("/api/reports", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ kind: z.enum(["PHOTO", "SUGGESTION"]), refId: z.string().uuid(), reason: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const found = await lookup(me.tenantId, body.data.kind, body.data.refId);
    if (!found) return reply.code(404).send({ error: "not_found" });
    // One open report per person per item (don't let one user pile on).
    const [dupe] = await db.select({ id: contentReports.id }).from(contentReports)
      .where(and(eq(contentReports.kind, body.data.kind), eq(contentReports.refId, body.data.refId), eq(contentReports.reporterId, me.id), eq(contentReports.status, "OPEN")));
    if (dupe) return { ok: true, already: true };
    await db.insert(contentReports).values({ tenantId: me.tenantId, kind: body.data.kind, refId: body.data.refId, reporterId: me.id, reason: body.data.reason?.trim() || null });
    return { ok: true };
  });

  // Moderation queue — open reports, newest first, with a content preview. Cap-gated.
  app.get("/api/reports", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    if (!(await can(me, "content.moderate"))) return { items: [], canModerate: false };
    const rows = await db.select({ id: contentReports.id, kind: contentReports.kind, refId: contentReports.refId, reason: contentReports.reason, at: contentReports.createdAt, by: users.displayName })
      .from(contentReports).innerJoin(users, eq(users.id, contentReports.reporterId))
      .where(and(eq(contentReports.tenantId, me.tenantId), eq(contentReports.status, "OPEN")))
      .orderBy(desc(contentReports.createdAt));
    const items = [];
    for (const r of rows) {
      const c = await lookup(me.tenantId, r.kind, r.refId);
      items.push({ id: r.id, kind: r.kind, refId: r.refId, reason: r.reason, by: r.by, at: r.at.toISOString(), preview: c?.preview ?? "(removed)", caption: c?.caption ?? "", hidden: c?.hidden ?? true });
    }
    return { items, canModerate: true };
  });

  app.get("/api/reports/count", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    if (!(await can(me, "content.moderate"))) return { count: 0, canModerate: false };
    const rows = await db.select({ id: contentReports.id }).from(contentReports).where(and(eq(contentReports.tenantId, me.tenantId), eq(contentReports.status, "OPEN")));
    return { count: rows.length, canModerate: true };
  });

  app.post<{ Params: { id: string } }>("/api/reports/:id/resolve", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z.object({ action: z.enum(["HIDE", "DISMISS"]) }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    if (!(await can(me, "content.moderate"))) return reply.code(403).send({ error: "forbidden" });
    const [rep] = await db.select().from(contentReports).where(and(eq(contentReports.id, id.data), eq(contentReports.tenantId, me.tenantId)));
    if (!rep) return reply.code(404).send({ error: "not_found" });

    if (body.data.action === "HIDE") {
      if (rep.kind === "PHOTO") await db.update(eventPhotos).set({ hidden: true }).where(eq(eventPhotos.id, rep.refId));
      else await db.update(suggestions).set({ hidden: true }).where(eq(suggestions.id, rep.refId));
      // Close every open report against the same item, not just this one.
      await db.update(contentReports).set({ status: "ACTIONED", resolvedBy: me.id, resolvedAt: new Date() })
        .where(and(eq(contentReports.kind, rep.kind), eq(contentReports.refId, rep.refId), eq(contentReports.status, "OPEN")));
    } else {
      await db.update(contentReports).set({ status: "DISMISSED", resolvedBy: me.id, resolvedAt: new Date() }).where(eq(contentReports.id, rep.id));
    }
    await recordAudit({ action: "content.moderated", tenantId: me.tenantId, actorId: me.id, meta: { kind: rep.kind, refId: rep.refId, action: body.data.action } });
    return { ok: true };
  });
}
