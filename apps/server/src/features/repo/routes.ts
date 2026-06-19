import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { orgNodes, repoApprovers, repoComments, repoDomains, repoItems, users } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { ancestorNodes, userNodeId } from "../../lib/orgScope.js";
import { recordAudit } from "../../lib/audit.js";
import { can, isGoverned } from "../../lib/capabilities.js";

const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };
const CATEGORIES = ["POLICY", "TOOLS", "PROTOCOL", "MEETING", "NEWS", "GENERAL"] as const;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// A whitelisted domain matches the host exactly or as a parent domain (google.com covers docs.google.com).
function isWhitelisted(host: string | null, domains: string[]): boolean {
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function repoRoutes(app: FastifyInstance) {
  // Can this person approve items targeted at a node? Admins always; appointed approvers of the node or an ancestor.
  async function canApprove(user: { id: string; tenantId: string; role: string }, nodeId: string): Promise<boolean> {
    if (user.role === "TENANT_ADMIN") return true;
    const ancestors = await ancestorNodes(user.tenantId, nodeId);
    if (ancestors.size === 0) return false;
    const rows = await db.select({ nodeId: repoApprovers.nodeId }).from(repoApprovers).where(eq(repoApprovers.userId, user.id));
    return rows.some((r) => ancestors.has(r.nodeId));
  }

  // The org levels I can post to (my node + ancestors).
  app.get("/api/repo/scopes", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const ids = [...(await ancestorNodes(me.tenantId, await userNodeId(me.id)))];
    if (ids.length === 0) return { scopes: [] };
    const rows = await db.select({ id: orgNodes.id, name: orgNodes.name, nodeType: orgNodes.nodeType }).from(orgNodes).where(inArray(orgNodes.id, ids));
    return { scopes: rows };
  });

  // Precomputed approver check: admin, or appointed approver of a node or any ancestor (the sub-tree).
  async function approverContext(user: { id: string; tenantId: string; role: string }) {
    const isAdmin = user.role === "TENANT_ADMIN";
    const approverSet = new Set((await db.select({ nodeId: repoApprovers.nodeId }).from(repoApprovers).where(eq(repoApprovers.userId, user.id))).map((r) => r.nodeId));
    const nodes = await db.select({ id: orgNodes.id, parentId: orgNodes.parentId }).from(orgNodes).where(eq(orgNodes.tenantId, user.tenantId));
    const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
    const covers = (nodeId: string): boolean => {
      if (isAdmin) return true;
      let cur: string | null = nodeId;
      let g = 0;
      while (cur && g++ < 30) {
        if (approverSet.has(cur)) return true;
        cur = parent.get(cur) ?? null;
      }
      return false;
    };
    return { covers };
  }

  // Approved items visible to me (anything on a level I belong to), plus my own submissions.
  app.get("/api/repo/items", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const scope = [...(await ancestorNodes(me.tenantId, await userNodeId(me.id)))];
    const node = alias(orgNodes, "node");
    const submitter = alias(users, "submitter");
    const visible = scope.length ? or(and(eq(repoItems.status, "APPROVED"), inArray(repoItems.nodeId, scope)), eq(repoItems.submittedBy, me.id)) : eq(repoItems.submittedBy, me.id);
    const rows = await db
      .select({ id: repoItems.id, nodeId: repoItems.nodeId, kind: repoItems.kind, category: repoItems.category, title: repoItems.title, url: repoItems.url, body: repoItems.body, itemDate: repoItems.itemDate, status: repoItems.status, createdAt: repoItems.createdAt, submittedBy: repoItems.submittedBy, nodeName: node.name, nodeType: node.nodeType, submitterName: submitter.displayName })
      .from(repoItems)
      .innerJoin(node, eq(node.id, repoItems.nodeId))
      .innerJoin(submitter, eq(submitter.id, repoItems.submittedBy))
      .where(visible)
      .orderBy(desc(repoItems.createdAt))
      .limit(200);

    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length) for (const c of await db.select({ itemId: repoComments.itemId, c: count() }).from(repoComments).where(inArray(repoComments.itemId, ids)).groupBy(repoComments.itemId)) counts.set(c.itemId, Number(c.c));
    const { covers } = await approverContext(me);

    return {
      items: rows.map((r) => ({
        id: r.id, kind: r.kind, category: r.category, title: r.title, url: r.url, body: r.body, itemDate: r.itemDate, status: r.status,
        createdAt: r.createdAt.toISOString(), nodeName: r.nodeName, nodeType: r.nodeType, submitterName: r.submitterName,
        commentCount: counts.get(r.id) ?? 0,
        canEdit: r.submittedBy === me.id || covers(r.nodeId),
      })),
    };
  });

  // Pending items I'm allowed to review.
  app.get("/api/repo/pending", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const node = alias(orgNodes, "node");
    const submitter = alias(users, "submitter");
    const rows = await db
      .select({ id: repoItems.id, nodeId: repoItems.nodeId, kind: repoItems.kind, title: repoItems.title, url: repoItems.url, body: repoItems.body, createdAt: repoItems.createdAt, nodeName: node.name, submitterName: submitter.displayName })
      .from(repoItems)
      .innerJoin(node, eq(node.id, repoItems.nodeId))
      .innerJoin(submitter, eq(submitter.id, repoItems.submittedBy))
      .where(eq(repoItems.status, "PENDING"))
      .orderBy(desc(repoItems.createdAt));
    const mine = [];
    for (const r of rows) if (await canApprove(me, r.nodeId)) mine.push({ ...r, createdAt: r.createdAt.toISOString() });
    return { items: mine };
  });

  // Decide the status for a new/edited item under our safety rules.
  async function decideStatus(me: { id: string; tenantId: string; role: string }, nodeId: string, kind: string, host: string | null): Promise<"PENDING" | "APPROVED"> {
    const [node] = await db.select({ path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.id, nodeId));
    const wl = (await db.select({ d: repoDomains.domain }).from(repoDomains).where(eq(repoDomains.tenantId, me.tenantId))).map((r) => r.d);
    const trusted = await canApprove(me, nodeId);
    // "Wide" = a high/broad node (org root or a top-level branch), judged by tree depth not a label —
    // so it holds for any org structure. Posting wide while untrusted needs approval.
    const wide = node ? node.path.split(".").length <= 2 : true;
    const riskyLink = kind === "LINK" && !isWhitelisted(host, wl);
    return !trusted && (wide || riskyLink) ? "PENDING" : "APPROVED";
  }

  const itemBody = z.object({
    kind: z.enum(["TEXT", "LINK"]),
    category: z.enum(CATEGORIES).optional(),
    title: z.string().min(1).max(200),
    nodeId: z.string().uuid(),
    url: z.string().url().max(2000).nullish(),
    body: z.string().max(2000).nullish(),
    itemDate: z.string().date().nullish(),
  });

  // Submit an item. Goes live unless it needs review (risky link, or a wide scope, by a non-approver).
  app.post("/api/repo/items", { preHandler: requireAuth }, async (req, reply) => {
    const body = itemBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const scope = await ancestorNodes(me.tenantId, await userNodeId(me.id));
    // You post to nodes you belong to; admins can post to any node in their tenant.
    if (!scope.has(body.data.nodeId)) {
      const [n] = me.role === "TENANT_ADMIN" ? await db.select({ id: orgNodes.id }).from(orgNodes).where(and(eq(orgNodes.id, body.data.nodeId), eq(orgNodes.tenantId, me.tenantId))) : [];
      if (!n) return reply.code(403).send({ error: "not_in_scope" });
    }
    if (body.data.kind === "LINK" && !body.data.url) return reply.code(400).send({ error: "link_needs_url" });
    if (body.data.kind === "TEXT" && !body.data.body?.trim()) return reply.code(400).send({ error: "text_needs_body" });

    // Capability enforcement — only for users assigned to a permission group (others keep legacy access).
    if (me.role !== "TENANT_ADMIN" && (await isGoverned(me.id))) {
      if (!(await can(me, "repo.post", body.data.nodeId))) return reply.code(403).send({ error: "no_permission" });
      if (body.data.kind === "LINK" && !(await can(me, "repo.post.links"))) return reply.code(403).send({ error: "links_not_allowed" });
    }

    const host = body.data.kind === "LINK" ? hostnameOf(body.data.url!) : null;
    const status = await decideStatus(me, body.data.nodeId, body.data.kind, host);
    await db.insert(repoItems).values({
      nodeId: body.data.nodeId,
      kind: body.data.kind,
      category: body.data.category ?? "GENERAL",
      title: body.data.title,
      url: body.data.url ?? null,
      body: body.data.body ?? null,
      itemDate: body.data.itemDate ?? null,
      domain: host,
      submittedBy: me.id,
      status,
      reviewedBy: status === "APPROVED" ? me.id : null,
    });
    return { ok: true, status };
  });

  // Edit an item (the submitter, or an approver/admin for its node). Re-checks the safety rules.
  app.patch<{ Params: { id: string } }>("/api/repo/items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const body = itemBody.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [item] = await db.select().from(repoItems).where(eq(repoItems.id, req.params.id));
    if (!item) return reply.code(404).send({ error: "not_found" });
    const trusted = await canApprove(me, item.nodeId);
    if (item.submittedBy !== me.id && !trusted) return reply.code(403).send({ error: "not_allowed" });

    const kind = body.data.kind ?? item.kind;
    const url = body.data.url !== undefined ? body.data.url : item.url;
    const host = kind === "LINK" ? hostnameOf(url ?? "") : null;
    // A trusted editor keeps it published; otherwise re-evaluate (e.g. swapping in a risky link → back to review).
    const status = trusted ? "APPROVED" : await decideStatus(me, item.nodeId, kind, host);
    await db
      .update(repoItems)
      .set({
        kind,
        category: body.data.category ?? item.category,
        title: body.data.title ?? item.title,
        url: url ?? null,
        body: body.data.body !== undefined ? body.data.body : item.body,
        itemDate: body.data.itemDate !== undefined ? body.data.itemDate : item.itemDate,
        domain: host,
        status,
        reviewedBy: status === "APPROVED" ? me.id : null,
      })
      .where(eq(repoItems.id, item.id));
    return { ok: true, status };
  });

  // Comments — anyone who can see the item.
  async function canSeeItem(me: { id: string; tenantId: string }, item: { nodeId: string; status: string; submittedBy: string }): Promise<boolean> {
    if (item.submittedBy === me.id) return true;
    if (item.status !== "APPROVED") return false;
    return (await ancestorNodes(me.tenantId, await userNodeId(me.id))).has(item.nodeId);
  }
  app.get<{ Params: { id: string } }>("/api/repo/items/:id/comments", { preHandler: requireAuth }, async (req, reply) => {
    const [item] = await db.select({ nodeId: repoItems.nodeId, status: repoItems.status, submittedBy: repoItems.submittedBy }).from(repoItems).where(eq(repoItems.id, req.params.id));
    if (!item || !(await canSeeItem(req.currentUser!, item))) return reply.code(404).send({ error: "not_found" });
    const rows = await db
      .select({ id: repoComments.id, body: repoComments.body, createdAt: repoComments.createdAt, name: users.displayName })
      .from(repoComments)
      .innerJoin(users, eq(users.id, repoComments.userId))
      .where(eq(repoComments.itemId, req.params.id))
      .orderBy(repoComments.createdAt);
    return { comments: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });
  app.post<{ Params: { id: string } }>("/api/repo/items/:id/comments", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ body: z.string().min(1).max(1000) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const [item] = await db.select({ nodeId: repoItems.nodeId, status: repoItems.status, submittedBy: repoItems.submittedBy }).from(repoItems).where(eq(repoItems.id, req.params.id));
    if (!item || !(await canSeeItem(req.currentUser!, item))) return reply.code(404).send({ error: "not_found" });
    await db.insert(repoComments).values({ itemId: req.params.id, userId: req.currentUser!.id, body: parsed.data.body });
    return { ok: true };
  });

  // Approve / reject a pending item (approver or admin for its node).
  for (const action of ["approve", "reject"] as const) {
    app.post<{ Params: { id: string } }>(`/api/repo/items/:id/${action}`, { preHandler: requireAuth }, async (req, reply) => {
      const me = req.currentUser!;
      const [item] = await db.select({ id: repoItems.id, nodeId: repoItems.nodeId, status: repoItems.status }).from(repoItems).where(eq(repoItems.id, req.params.id));
      if (!item) return reply.code(404).send({ error: "not_found" });
      if (!(await canApprove(me, item.nodeId))) return reply.code(403).send({ error: "not_allowed" });
      await db.update(repoItems).set({ status: action === "approve" ? "APPROVED" : "REJECTED", reviewedBy: me.id }).where(eq(repoItems.id, item.id));
      await recordAudit({ action: `repo.${action}`, tenantId: me.tenantId, actorId: me.id, meta: { itemId: item.id, nodeId: item.nodeId } });
      return { ok: true };
    });
  }

  // --- Admin: appointed approvers ---
  app.get("/api/repo/approvers", adminOnly, async (req) => {
    const rows = await db
      .select({ nodeId: repoApprovers.nodeId, userId: repoApprovers.userId, nodeName: orgNodes.name, userName: users.displayName })
      .from(repoApprovers)
      .innerJoin(orgNodes, eq(orgNodes.id, repoApprovers.nodeId))
      .innerJoin(users, eq(users.id, repoApprovers.userId))
      .where(eq(orgNodes.tenantId, req.currentUser!.tenantId));
    return { approvers: rows };
  });
  app.post("/api/repo/approvers", adminOnly, async (req, reply) => {
    const body = z.object({ nodeId: z.string().uuid(), userId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await db.insert(repoApprovers).values(body.data).onConflictDoNothing();
    await recordAudit({ action: "repo.approver_added", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: body.data });
    return { ok: true };
  });
  app.delete("/api/repo/approvers", adminOnly, async (req, reply) => {
    const body = z.object({ nodeId: z.string().uuid(), userId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await db.delete(repoApprovers).where(and(eq(repoApprovers.nodeId, body.data.nodeId), eq(repoApprovers.userId, body.data.userId)));
    return { ok: true };
  });

  // --- Admin: domain whitelist ---
  app.get("/api/repo/domains", adminOnly, async (req) => {
    const rows = await db.select({ id: repoDomains.id, domain: repoDomains.domain }).from(repoDomains).where(eq(repoDomains.tenantId, req.currentUser!.tenantId)).orderBy(repoDomains.domain);
    return { domains: rows };
  });
  app.post("/api/repo/domains", adminOnly, async (req, reply) => {
    const body = z.object({ domain: z.string().min(3).max(120) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const clean = body.data.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    await db.insert(repoDomains).values({ tenantId: req.currentUser!.tenantId, domain: clean }).onConflictDoNothing();
    await recordAudit({ action: "repo.domain_added", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { domain: clean } });
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/repo/domains/:id", adminOnly, async (req) => {
    await db.delete(repoDomains).where(and(eq(repoDomains.id, req.params.id), eq(repoDomains.tenantId, req.currentUser!.tenantId)));
    await recordAudit({ action: "repo.domain_removed", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { domainId: req.params.id } });
    return { ok: true };
  });
}
