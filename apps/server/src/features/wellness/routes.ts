import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { wellnessCheckins, wellnessResources, orgNodes } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { userNodeId } from "../../lib/orgScope.js";
import { recordAudit } from "../../lib/audit.js";

const K = 5; // never render a group's wellness below this many check-ins
const WINDOW_DAYS = 60; // "current" mood reflects the last N days
const today = () => new Date().toISOString().slice(0, 10);
const windowStart = () => new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

export function wellnessRoutes(app: FastifyInstance) {
  // Anyone can check in, any time. We store NO identity — only the person's department and a
  // coarse day — so it stays anonymous and people feel safe being honest.
  app.post("/api/wellness/checkin", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ stress: z.number().int().min(1).max(5), note: z.string().max(1000).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    await db.insert(wellnessCheckins).values({ tenantId: me.tenantId, nodeId: await userNodeId(me.id), stress: body.data.stress, note: body.data.note?.trim() || null, createdDay: today() });
    return { ok: true };
  });

  // The stress portal (admin). Aggregate only, k-anonymity enforced for EVERY group incl. the
  // viewer — small departments never render (can't single anyone out).
  app.get("/api/wellness", { preHandler: requireRole("TENANT_ADMIN") }, async (req) => {
    const me = req.currentUser!;
    const rows = await db
      .select({ nodeId: wellnessCheckins.nodeId, stress: wellnessCheckins.stress, createdDay: wellnessCheckins.createdDay })
      .from(wellnessCheckins)
      .where(and(eq(wellnessCheckins.tenantId, me.tenantId), gte(wellnessCheckins.createdDay, windowStart())));

    const agg = (list: number[]) => (list.length >= K ? { count: list.length, avg: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 } : { count: list.length, locked: true });

    const overall = agg(rows.map((r) => r.stress));
    // By department (the node each check-in was tagged with). Only k≥5 groups get numbers.
    const byNode = new Map<string, number[]>();
    for (const r of rows) if (r.nodeId) byNode.set(r.nodeId, [...(byNode.get(r.nodeId) ?? []), r.stress]);
    const names = byNode.size ? Object.fromEntries((await db.select({ id: orgNodes.id, name: orgNodes.name }).from(orgNodes).where(eq(orgNodes.tenantId, me.tenantId))).map((n) => [n.id, n.name])) : {};
    const departments = [...byNode.entries()].map(([nodeId, list]) => ({ name: names[nodeId] ?? "Department", ...agg(list) })).filter((d) => !("locked" in d) || d.count > 0).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

    // W2 — org-wide stress trend, bucketed by week over the window. Each week is k-anonymous on
    // its own: a week with fewer than K check-ins shows no number (can't infer from a tiny week).
    const weeks = Math.ceil(WINDOW_DAYS / 7);
    const todayMs = Date.parse(today());
    const buckets: number[][] = Array.from({ length: weeks }, () => []);
    for (const r of rows) {
      const wi = Math.floor((todayMs - Date.parse(r.createdDay)) / (7 * 86400_000));
      if (wi >= 0 && wi < weeks) buckets[wi].push(r.stress);
    }
    const trend = buckets.map((list, wi) => ({ weeksAgo: wi, ...agg(list) })).reverse(); // oldest → newest

    return { k: K, windowDays: WINDOW_DAYS, overall, departments, trend };
  });

  // --- W3: institution support content (resources + "get help" contacts) ---
  // Everyone sees the PUBLISHED resources on their wellness page. Admins manage them and also see
  // drafts. Help contacts are plain mailto:/wa.me links the person follows off-app, so reaching
  // out is private and leaves no trail here.
  app.get("/api/wellness/resources", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const isAdmin = me.role === "TENANT_ADMIN";
    const rows = await db
      .select()
      .from(wellnessResources)
      .where(and(eq(wellnessResources.tenantId, me.tenantId), ...(isAdmin ? [] : [eq(wellnessResources.published, true)])))
      .orderBy(asc(wellnessResources.sortOrder), asc(wellnessResources.createdAt));
    return { canManage: isAdmin, resources: rows.map((r) => ({ id: r.id, title: r.title, body: r.body, url: r.url, email: r.email, whatsapp: r.whatsapp, published: r.published, sortOrder: r.sortOrder })) };
  });

  const resourceBody = z.object({
    title: z.string().trim().min(1).max(120),
    body: z.string().max(2000).optional(),
    url: z.string().trim().url().max(500).optional().or(z.literal("")),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    whatsapp: z.string().trim().max(30).regex(/^\+?[0-9 ()-]*$/).optional().or(z.literal("")),
    published: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });
  const clean = (s?: string) => (s && s.trim() ? s.trim() : null);

  app.post("/api/wellness/resources", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = resourceBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const d = body.data;
    const [row] = await db.insert(wellnessResources).values({ tenantId: me.tenantId, title: d.title.trim(), body: clean(d.body), url: clean(d.url), email: clean(d.email), whatsapp: clean(d.whatsapp), published: d.published ?? false, sortOrder: d.sortOrder ?? 0, createdBy: me.id }).returning({ id: wellnessResources.id });
    await recordAudit({ action: "wellness.resource.created", tenantId: me.tenantId, actorId: me.id, meta: { id: row.id } });
    return { id: row.id };
  });

  app.patch("/api/wellness/resources/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const body = resourceBody.partial().safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const d = body.data;
    const patch: Record<string, unknown> = {};
    if (d.title !== undefined) patch.title = d.title.trim();
    if (d.body !== undefined) patch.body = clean(d.body);
    if (d.url !== undefined) patch.url = clean(d.url);
    if (d.email !== undefined) patch.email = clean(d.email);
    if (d.whatsapp !== undefined) patch.whatsapp = clean(d.whatsapp);
    if (d.published !== undefined) patch.published = d.published;
    if (d.sortOrder !== undefined) patch.sortOrder = d.sortOrder;
    const res = await db.update(wellnessResources).set(patch).where(and(eq(wellnessResources.id, id.data), eq(wellnessResources.tenantId, me.tenantId))).returning({ id: wellnessResources.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    await recordAudit({ action: "wellness.resource.updated", tenantId: me.tenantId, actorId: me.id, meta: { id: id.data } });
    return { ok: true };
  });

  app.delete("/api/wellness/resources/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const res = await db.delete(wellnessResources).where(and(eq(wellnessResources.id, id.data), eq(wellnessResources.tenantId, me.tenantId))).returning({ id: wellnessResources.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    await recordAudit({ action: "wellness.resource.deleted", tenantId: me.tenantId, actorId: me.id, meta: { id: id.data } });
    return { ok: true };
  });
}
