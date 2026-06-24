import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { suggestions, suggestionVotes, complaintRoutes, orgNodes } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { can, hasScope } from "../../lib/capabilities.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";

type Me = { id: string; tenantId: string; role: string; nodeId?: string | null };
const today = () => new Date().toISOString().slice(0, 10); // coarse day only — never a full timestamp
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const NEXT = ["NEW", "REVIEWING", "PLANNED", "DONE", "DECLINED"] as const;
// Complaint categories — fixed list so routing rules + UI stay predictable.
const CATEGORIES = [
  { key: "HARASSMENT", label: "Harassment or discrimination" },
  { key: "PAY", label: "Pay & benefits" },
  { key: "WORKLOAD", label: "Workload & wellbeing" },
  { key: "MANAGEMENT", label: "Management" },
  { key: "FACILITIES", label: "Facilities & equipment" },
  { key: "SAFETY", label: "Health & safety" },
  { key: "OTHER", label: "Other" },
] as const;
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [string, ...string[]];

export function suggestionRoutes(app: FastifyInstance) {
  // Managing the box (triage + respond) is fail-closed: admin, ORG reach for the org box, or NODE reach
  // covering that department's box. NEVER no-lockout — this is sensitive feedback.
  async function canManage(me: Me, scopeKind: string, scopeId: string | null) {
    if (scopeKind === "ALL") return hasScope(me, "suggestion.manage", "ORG");
    return can(me, "suggestion.manage", scopeId ?? undefined);
  }
  const canSee = (me: Me, scopeKind: string, scopeId: string | null) =>
    canSeeScoped({ tenantId: me.tenantId, scopeKind, scopeId }, me.id, me.tenantId);

  // Submit — FORCED ANONYMOUS. We store NO identity, only a coarse day + the hash of a one-time claim
  // ticket the submitter keeps. The route never logs the body or who sent it.
  app.post("/api/suggestions", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ kind: z.enum(["SUGGESTION", "COMPLAINT"]), scopeKind: z.enum(["ALL", "NODE"]), scopeId: z.string().uuid().nullable().optional(), body: z.string().trim().min(3).max(2000), urgent: z.boolean().optional(), category: z.enum(CATEGORY_KEYS).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const d = body.data;
    // Routing: a complaint in a routed category goes to that team — its scope is set to the route's
    // node, overriding the chosen box. Suggestions never route (they're public).
    let scopeKind = d.scopeKind, scopeId: string | null = d.scopeId ?? null, routed = false;
    const category = d.kind === "COMPLAINT" ? d.category ?? null : null;
    if (category) {
      const [route] = await db.select({ node: complaintRoutes.targetNodeId }).from(complaintRoutes).where(and(eq(complaintRoutes.tenantId, me.tenantId), eq(complaintRoutes.category, category)));
      if (route) { scopeKind = "NODE"; scopeId = route.node; routed = true; }
    }
    if (scopeKind === "NODE" && !scopeId) return reply.code(400).send({ error: "scope_required" });
    // A routed complaint is directed by admin config, so the submitter needn't "see" the destination
    // box. For a self-chosen box, they must be in scope (can't post into a box they can't see).
    if (!routed && !(await canSee(me, scopeKind, scopeId))) return reply.code(403).send({ error: "forbidden" });
    const ticket = randomBytes(12).toString("base64url");
    const [row] = await db
      .insert(suggestions)
      .values({ tenantId: me.tenantId, scopeKind, scopeId, kind: d.kind, body: d.body.trim(), category, urgent: d.urgent ?? false, claimHash: sha(ticket), createdDay: today() })
      .returning({ id: suggestions.id });
    // No audit row — auditing a submission would tie an action to a time/actor near an anonymous artifact.
    return { id: row.id, ticket };
  });

  // List the items the viewer may see: public suggestions in their scope, plus complaints they manage.
  app.get("/api/suggestions", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(suggestions).where(and(eq(suggestions.tenantId, me.tenantId), eq(suggestions.hidden, false))).orderBy(desc(suggestions.createdDay));
    const out: { id: string; kind: string; body: string; status: string; urgent: boolean; category: string | null; response: string | null; scope: string; createdDay: string; updatedDay: string | null; canManage: boolean; votes: number; myVote: boolean }[] = [];
    for (const s of rows) {
      const manage = await canManage(me, s.scopeKind, s.scopeId);
      const visible = manage || (s.kind === "SUGGESTION" && (await canSee(me, s.scopeKind, s.scopeId)));
      if (!visible) continue;
      out.push({ id: s.id, kind: s.kind, body: s.body, status: s.status, urgent: s.urgent, category: s.category, response: s.response, scope: await scopeLabel(me.tenantId, s.scopeKind, s.scopeId), createdDay: s.createdDay, updatedDay: s.updatedDay, canManage: manage, votes: 0, myVote: false });
    }
    const ids = out.filter((o) => o.kind === "SUGGESTION").map((o) => o.id);
    const votes = ids.length ? await db.select({ s: suggestionVotes.suggestionId, u: suggestionVotes.userId }).from(suggestionVotes).where(inArray(suggestionVotes.suggestionId, ids)) : [];
    for (const o of out) { o.votes = votes.filter((v) => v.s === o.id).length; o.myVote = votes.some((v) => v.s === o.id && v.u === me.id); }
    // Unresolved safety flags first, then open items, then most-upvoted, then newest.
    const closed = (s: { status: string }) => s.status === "DONE" || s.status === "DECLINED";
    const urgentOpen = (s: { urgent: boolean; status: string }) => s.urgent && !closed(s);
    out.sort((a, b) => Number(urgentOpen(b)) - Number(urgentOpen(a)) || Number(closed(a)) - Number(closed(b)) || b.votes - a.votes || b.createdDay.localeCompare(a.createdDay));
    return { suggestions: out };
  });

  // Nav badge: open safety-flagged items the viewer is responsible for (managers only → 0 otherwise).
  // Carries no identity — just a count, so an urgent report is impossible to miss.
  app.get("/api/suggestions/urgent-count", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select({ id: suggestions.id, scopeKind: suggestions.scopeKind, scopeId: suggestions.scopeId, status: suggestions.status })
      .from(suggestions)
      .where(and(eq(suggestions.tenantId, me.tenantId), eq(suggestions.urgent, true)));
    let count = 0;
    for (const s of rows) {
      if (s.status === "DONE" || s.status === "DECLINED") continue;
      if (await canManage(me, s.scopeKind, s.scopeId)) count++;
    }
    return { count };
  });

  // Categories + the current routing map (which team handles each category). Readable by everyone so
  // the submit form can reassure people where a complaint goes; carries no identity.
  app.get("/api/suggestions/routes", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db
      .select({ category: complaintRoutes.category, nodeId: complaintRoutes.targetNodeId, nodeName: orgNodes.name })
      .from(complaintRoutes)
      .innerJoin(orgNodes, eq(orgNodes.id, complaintRoutes.targetNodeId))
      .where(eq(complaintRoutes.tenantId, me.tenantId));
    return { categories: CATEGORIES, routes: rows };
  });

  // Set/clear a category's route — org-level config, so tenant-admin only. Audited.
  app.put<{ Params: { category: string } }>("/api/suggestions/routes/:category", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const cat = z.enum(CATEGORY_KEYS).safeParse((req.params as { category: string }).category);
    const body = z.object({ nodeId: z.string().uuid() }).safeParse(req.body);
    if (!cat.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [node] = await db.select({ id: orgNodes.id }).from(orgNodes).where(and(eq(orgNodes.id, body.data.nodeId), eq(orgNodes.tenantId, me.tenantId)));
    if (!node) return reply.code(404).send({ error: "node_not_found" });
    await db.insert(complaintRoutes).values({ tenantId: me.tenantId, category: cat.data, targetNodeId: body.data.nodeId }).onConflictDoUpdate({ target: [complaintRoutes.tenantId, complaintRoutes.category], set: { targetNodeId: body.data.nodeId } });
    await recordAudit({ action: "complaint.route_set", tenantId: me.tenantId, actorId: me.id, meta: { category: cat.data, nodeId: body.data.nodeId } });
    return { ok: true };
  });
  app.delete<{ Params: { category: string } }>("/api/suggestions/routes/:category", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const cat = z.enum(CATEGORY_KEYS).safeParse((req.params as { category: string }).category);
    if (!cat.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    await db.delete(complaintRoutes).where(and(eq(complaintRoutes.tenantId, me.tenantId), eq(complaintRoutes.category, cat.data)));
    await recordAudit({ action: "complaint.route_cleared", tenantId: me.tenantId, actorId: me.id, meta: { category: cat.data } });
    return { ok: true };
  });

  // Upvote a suggestion (toggle). Voting is attributed and reveals nothing about authorship.
  app.post<{ Params: { id: string } }>("/api/suggestions/:id/vote", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [s] = await db.select().from(suggestions).where(and(eq(suggestions.id, id.data), eq(suggestions.tenantId, me.tenantId)));
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.kind !== "SUGGESTION") return reply.code(400).send({ error: "not_votable" }); // complaints aren't a popularity contest
    if (!(await canSee(me, s.scopeKind, s.scopeId))) return reply.code(403).send({ error: "forbidden" });
    const del = await db.delete(suggestionVotes).where(and(eq(suggestionVotes.suggestionId, s.id), eq(suggestionVotes.userId, me.id))).returning({ s: suggestionVotes.suggestionId });
    if (!del.length) await db.insert(suggestionVotes).values({ suggestionId: s.id, userId: me.id });
    return { ok: true };
  });

  // Triage / respond (managers). A reply is mandatory before an item is planned/done/declined.
  app.patch<{ Params: { id: string } }>("/api/suggestions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z.object({ status: z.enum(NEXT).optional(), response: z.string().trim().max(2000).nullable().optional() }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [s] = await db.select().from(suggestions).where(and(eq(suggestions.id, id.data), eq(suggestions.tenantId, me.tenantId)));
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (!(await canManage(me, s.scopeKind, s.scopeId))) return reply.code(403).send({ error: "forbidden" });
    const status = body.data.status ?? s.status;
    const response = body.data.response !== undefined ? body.data.response || null : s.response;
    await db.update(suggestions).set({ status, response, updatedDay: today() }).where(eq(suggestions.id, s.id));
    // Privileged moderation — audited by id + status only (never the content or any submitter identity).
    await recordAudit({ action: "suggestion.updated", tenantId: me.tenantId, actorId: me.id, meta: { id: s.id, status } });
    return { ok: true };
  });

  // Follow up anonymously: the submitter proves authorship with their claim ticket and reads the status.
  app.post<{ Params: { id: string } }>("/api/suggestions/:id/claim", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z.object({ ticket: z.string().min(1).max(200) }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [s] = await db.select().from(suggestions).where(and(eq(suggestions.id, id.data), eq(suggestions.tenantId, me.tenantId)));
    if (!s) return reply.code(404).send({ error: "not_found" });
    const h = sha(body.data.ticket);
    if (h.length !== s.claimHash.length || !timingSafeEqual(Buffer.from(h), Buffer.from(s.claimHash))) return reply.code(403).send({ error: "bad_ticket" });
    return { id: s.id, kind: s.kind, body: s.body, status: s.status, response: s.response, createdDay: s.createdDay, updatedDay: s.updatedDay };
  });
}
