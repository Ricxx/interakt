import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { surveys, surveyInsights, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { ownSurvey } from "./routes.js";

const body = z.object({ title: z.string().min(1).max(200), body: z.string().max(20000).optional(), published: z.boolean().optional() });

export function surveyInsightRoutes(app: FastifyInstance) {
  // The "Insights" feed: everything published in the tenant, plus my own drafts.
  app.get("/api/insights", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db
      .select({ id: surveyInsights.id, surveyId: surveyInsights.surveyId, surveyTitle: surveys.title, title: surveyInsights.title, body: surveyInsights.body, published: surveyInsights.published, byName: users.displayName, createdAt: surveyInsights.createdAt })
      .from(surveyInsights)
      .innerJoin(surveys, eq(surveys.id, surveyInsights.surveyId))
      .innerJoin(users, eq(users.id, surveyInsights.createdBy))
      .where(and(eq(surveyInsights.tenantId, me.tenantId), or(eq(surveyInsights.published, true), eq(surveyInsights.createdBy, me.id))))
      .orderBy(desc(surveyInsights.createdAt));
    return { insights: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });

  // Insights for one survey — the owner sees drafts too; everyone else only published.
  app.get<{ Params: { id: string } }>("/api/surveys/:id/insights", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [s] = await db.select().from(surveys).where(and(eq(surveys.id, req.params.id), eq(surveys.tenantId, me.tenantId)));
    if (!s) return reply.code(404).send({ error: "not_found" });
    const isOwner = !!(await ownSurvey(s.id, me));
    const rows = await db.select().from(surveyInsights).where(eq(surveyInsights.surveyId, s.id)).orderBy(desc(surveyInsights.createdAt));
    const visible = rows.filter((r) => r.published || isOwner);
    return { isOwner, insights: visible.map((r) => ({ id: r.id, title: r.title, body: r.body, published: r.published, createdAt: r.createdAt.toISOString() })) };
  });

  // Author an insight (survey owner / admin).
  app.post<{ Params: { id: string } }>("/api/surveys/:id/insights", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await ownSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const [ins] = await db.insert(surveyInsights).values({ tenantId: me.tenantId, surveyId: s.id, title: parsed.data.title, body: parsed.data.body ?? "", published: parsed.data.published ?? false, createdBy: me.id }).returning();
    return { insight: { id: ins.id } };
  });

  app.patch<{ Params: { insId: string } }>("/api/insights/:insId", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = body.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [ins] = await db.select().from(surveyInsights).where(and(eq(surveyInsights.id, req.params.insId), eq(surveyInsights.tenantId, me.tenantId)));
    if (!ins || !(await ownSurvey(ins.surveyId, me))) return reply.code(404).send({ error: "not_found" });
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "body", "published"] as const) if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
    if (Object.keys(patch).length) await db.update(surveyInsights).set(patch).where(eq(surveyInsights.id, ins.id));
    return { ok: true };
  });

  app.delete<{ Params: { insId: string } }>("/api/insights/:insId", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [ins] = await db.select().from(surveyInsights).where(and(eq(surveyInsights.id, req.params.insId), eq(surveyInsights.tenantId, me.tenantId)));
    if (!ins || !(await ownSurvey(ins.surveyId, me))) return reply.code(404).send({ error: "not_found" });
    await db.delete(surveyInsights).where(eq(surveyInsights.id, ins.id));
    return { ok: true };
  });
}
