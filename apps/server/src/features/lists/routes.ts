import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { lists, listItems, listEvents, listItemComments, listReads, orgNodes, groups, users } from "../../db/schema.js";
import { max } from "drizzle-orm";
import { requireAuth, type CurrentUser } from "../../auth.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";
import { userNodeId } from "../../lib/orgScope.js";
import { can, hasScope, isGoverned } from "../../lib/capabilities.js";

// Governed users need list.create to make a list, and list.distribute reach for its scope
// (org-wide → ORG, a node → reach to it, a group → just the cap). Ungoverned users: open default.
async function canMakeList(user: CurrentUser, scope: { scopeKind: string; scopeId: string | null }): Promise<boolean> {
  if (!(await isGoverned(user.id))) return true;
  if (!(await can(user, "list.create"))) return false;
  if (scope.scopeKind === "ALL") return hasScope(user, "list.distribute", "ORG");
  if (scope.scopeKind === "GROUP") return can(user, "list.distribute");
  return can(user, "list.distribute", scope.scopeId ?? undefined);
}

const createBody = z.object({
  title: z.string().min(1).max(160),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "QUARTERLY"]).default("NONE"),
  // Omit scope to default to the creator's department (or org-wide if they have no node).
  scopeKind: z.enum(["ALL", "NODE", "GROUP"]).optional(),
  scopeId: z.string().uuid().optional(),
});
const itemBody = z.object({ text: z.string().min(1).max(500) });
const commentBody = z.object({ body: z.string().min(1).max(1000) });

type ListRow = typeof lists.$inferSelect;

// A list in the caller's tenant that they're allowed to see, or null.
// Visibility == access: if you can see a list, you can act on it.
async function visibleList(id: string, user: CurrentUser): Promise<ListRow | null> {
  const [l] = await db.select().from(lists).where(and(eq(lists.id, id), eq(lists.tenantId, user.tenantId)));
  if (!l || !(await canSeeScoped(l, user.id, user.tenantId))) return null;
  return l;
}

async function logEvent(listId: string, actorId: string, action: string, detail?: string) {
  await db.insert(listEvents).values({ listId, actorId, action, detail: detail ?? null });
}

// Remember that this user has now seen the list up to this moment.
async function markRead(listId: string, userId: string) {
  await db
    .insert(listReads)
    .values({ listId, userId })
    .onConflictDoUpdate({ target: [listReads.listId, listReads.userId], set: { lastSeenAt: new Date() } });
}

// Start (UTC) of the current period for a recurrence — the boundary a recurring list
// resets at. NONE never resets. (UTC for now; per-tenant timezone is a later refinement.)
function startOfPeriod(now: Date, recurrence: string): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (recurrence === "WEEKLY") {
    const offset = (day.getUTCDay() + 6) % 7; // days since Monday
    day.setUTCDate(day.getUTCDate() - offset);
  } else if (recurrence === "QUARTERLY") {
    return new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  }
  return day; // DAILY (and NONE, unused)
}

// Lazy reset: if a recurring list hasn't been reset this period, atomically claim the
// reset (so concurrent reads don't double-run), uncheck every item, and log it.
async function maybeReset(l: ListRow): Promise<void> {
  if (l.recurrence === "NONE") return;
  const now = new Date();
  const periodStart = startOfPeriod(now, l.recurrence);
  if (l.lastResetAt >= periodStart) return;
  const [claimed] = await db
    .update(lists)
    .set({ lastResetAt: now })
    .where(and(eq(lists.id, l.id), lt(lists.lastResetAt, periodStart)))
    .returning({ id: lists.id });
  if (!claimed) return; // another request won the claim
  await db.update(listItems).set({ done: false, doneBy: null, doneAt: null }).where(and(eq(listItems.listId, l.id), eq(listItems.done, true)));
  await logEvent(l.id, l.createdBy, "reset", l.recurrence.toLowerCase());
}

async function visibleItemList(itemId: string, user: CurrentUser) {
  const [item] = await db.select().from(listItems).where(eq(listItems.id, itemId));
  if (!item) return { item: null, list: null };
  return { item, list: await visibleList(item.listId, user) };
}

// Resolve the requested scope (or default to the creator's department), validating
// that any node/group belongs to the caller's tenant.
async function resolveScope(
  data: { scopeKind?: "ALL" | "NODE" | "GROUP"; scopeId?: string },
  user: CurrentUser,
): Promise<{ scopeKind: string; scopeId: string | null } | { error: string }> {
  if (!data.scopeKind) {
    const myNode = await userNodeId(user.id);
    return myNode ? { scopeKind: "NODE", scopeId: myNode } : { scopeKind: "ALL", scopeId: null };
  }
  if (data.scopeKind === "ALL") return { scopeKind: "ALL", scopeId: null };
  if (!data.scopeId) return { error: "scope_id_required" };
  if (data.scopeKind === "NODE") {
    const [n] = await db.select({ id: orgNodes.id }).from(orgNodes).where(and(eq(orgNodes.id, data.scopeId), eq(orgNodes.tenantId, user.tenantId)));
    return n ? { scopeKind: "NODE", scopeId: data.scopeId } : { error: "invalid_scope" };
  }
  const [g] = await db.select({ id: groups.id }).from(groups).where(and(eq(groups.id, data.scopeId), eq(groups.tenantId, user.tenantId)));
  return g ? { scopeKind: "GROUP", scopeId: data.scopeId } : { error: "invalid_scope" };
}

export function listRoutes(app: FastifyInstance) {
  // Lists the caller can see, with item + done counts and a scope label.
  app.get("/api/lists", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db.select().from(lists).where(eq(lists.tenantId, me.tenantId)).orderBy(desc(lists.createdAt));
    const visible = [];
    for (const l of rows) {
      if (!(await canSeeScoped(l, me.id, me.tenantId))) continue;
      await maybeReset(l); // recurring lists roll over before we count
      const items = await db.select({ done: listItems.done }).from(listItems).where(eq(listItems.listId, l.id));
      visible.push({ id: l.id, title: l.title, status: l.status, recurrence: l.recurrence, scopeKind: l.scopeKind, scope: await scopeLabel(me.tenantId, l.scopeKind, l.scopeId), total: items.length, done: items.filter((i) => i.done).length });
    }

    // "Updated since you looked": latest activity per list vs your last-seen time.
    const ids = visible.map((l) => l.id);
    const lastSeen = new Map<string, Date>();
    const lastActivity = new Map<string, Date>();
    if (ids.length) {
      for (const r of await db.select({ listId: listReads.listId, at: listReads.lastSeenAt }).from(listReads).where(and(eq(listReads.userId, me.id), inArray(listReads.listId, ids)))) lastSeen.set(r.listId, r.at);
      for (const r of await db.select({ listId: listEvents.listId, at: max(listEvents.createdAt) }).from(listEvents).where(inArray(listEvents.listId, ids)).groupBy(listEvents.listId)) if (r.at) lastActivity.set(r.listId, r.at);
    }
    const out = visible.map((l) => {
      const activity = lastActivity.get(l.id);
      const seen = lastSeen.get(l.id);
      return { ...l, unread: !!activity && (!seen || activity > seen) };
    });
    return { lists: out };
  });

  app.post("/api/lists", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const scope = await resolveScope(parsed.data, me);
    if ("error" in scope) return reply.code(400).send({ error: scope.error });
    if (!(await canMakeList(me, scope))) return reply.code(403).send({ error: "not_allowed" });
    const [l] = await db
      .insert(lists)
      .values({ tenantId: me.tenantId, title: parsed.data.title, recurrence: parsed.data.recurrence, scopeKind: scope.scopeKind, scopeId: scope.scopeId, createdBy: me.id })
      .returning();
    await logEvent(l.id, me.id, "created", l.title);
    await markRead(l.id, me.id); // you've "seen" the list you just made
    return { list: { id: l.id } };
  });

  // A list with its items + recent activity log.
  app.get<{ Params: { id: string } }>("/api/lists/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    let l = await visibleList(req.params.id, me);
    if (!l) return reply.code(404).send({ error: "not_found" });
    await maybeReset(l);
    l = (await visibleList(l.id, me))!; // re-read post-reset for fresh item state
    const items = await db.select().from(listItems).where(eq(listItems.listId, l.id)).orderBy(listItems.createdAt);
    const itemIds = items.map((i) => i.id);
    const commentRows = itemIds.length
      ? await db.select({ itemId: listItemComments.itemId }).from(listItemComments).where(inArray(listItemComments.itemId, itemIds))
      : [];
    const commentCount = new Map<string, number>();
    for (const c of commentRows) commentCount.set(c.itemId, (commentCount.get(c.itemId) ?? 0) + 1);
    const log = await db
      .select({ id: listEvents.id, action: listEvents.action, detail: listEvents.detail, actorName: users.displayName, createdAt: listEvents.createdAt })
      .from(listEvents)
      .innerJoin(users, eq(users.id, listEvents.actorId))
      .where(eq(listEvents.listId, l.id))
      .orderBy(desc(listEvents.id))
      .limit(30);
    const payload = {
      list: { id: l.id, title: l.title, status: l.status, recurrence: l.recurrence, scope: await scopeLabel(me.tenantId, l.scopeKind, l.scopeId) },
      items: items.map((i) => ({ id: i.id, text: i.text, done: i.done, doneAt: i.doneAt?.toISOString() ?? null, comments: commentCount.get(i.id) ?? 0 })),
      log: log.map((e) => ({ id: e.id, action: e.action, detail: e.detail, actorName: e.actorName, createdAt: e.createdAt.toISOString() })),
    };
    await markRead(l.id, me.id); // opening the list clears its "updated" badge for you
    return payload;
  });

  // Add an item (only while the list is open).
  app.post<{ Params: { id: string } }>("/api/lists/:id/items", { preHandler: requireAuth }, async (req, reply) => {
    const body = itemBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const l = await visibleList(req.params.id, me);
    if (!l) return reply.code(404).send({ error: "not_found" });
    if (l.status !== "OPEN") return reply.code(409).send({ error: "list_closed" });
    await db.insert(listItems).values({ listId: l.id, text: body.data.text, createdBy: me.id });
    await logEvent(l.id, me.id, "item_added", body.data.text);
    return { ok: true };
  });

  // Check / uncheck an item.
  app.post<{ Params: { itemId: string } }>("/api/lists/items/:itemId/toggle", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const { item, list } = await visibleItemList(req.params.itemId, me);
    if (!item || !list) return reply.code(404).send({ error: "not_found" });
    if (list.status !== "OPEN") return reply.code(409).send({ error: "list_closed" });
    const done = !item.done;
    await db.update(listItems).set({ done, doneBy: done ? me.id : null, doneAt: done ? new Date() : null }).where(eq(listItems.id, item.id));
    await logEvent(list.id, me.id, done ? "item_checked" : "item_unchecked", item.text);
    return { ok: true };
  });

  // Comments on an item.
  app.get<{ Params: { itemId: string } }>("/api/lists/items/:itemId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const { item, list } = await visibleItemList(req.params.itemId, req.currentUser!);
    if (!item || !list) return reply.code(404).send({ error: "not_found" });
    const rows = await db
      .select({ id: listItemComments.id, name: users.displayName, body: listItemComments.body, createdAt: listItemComments.createdAt })
      .from(listItemComments)
      .innerJoin(users, eq(users.id, listItemComments.userId))
      .where(eq(listItemComments.itemId, item.id))
      .orderBy(listItemComments.createdAt);
    return { comments: rows.map((r) => ({ id: r.id, name: r.name, body: r.body, createdAt: r.createdAt.toISOString() })) };
  });

  app.post<{ Params: { itemId: string } }>("/api/lists/items/:itemId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const body = commentBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const { item, list } = await visibleItemList(req.params.itemId, me);
    if (!item || !list) return reply.code(404).send({ error: "not_found" });
    await db.insert(listItemComments).values({ itemId: item.id, userId: me.id, body: body.data.body });
    await logEvent(list.id, me.id, "commented", item.text); // surfaces in the log + drives "updated" badges
    return { ok: true };
  });

  // Close or reopen a list.
  app.post<{ Params: { id: string } }>("/api/lists/:id/close-toggle", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const l = await visibleList(req.params.id, me);
    if (!l) return reply.code(404).send({ error: "not_found" });
    const status = l.status === "OPEN" ? "CLOSED" : "OPEN";
    await db.update(lists).set({ status }).where(eq(lists.id, l.id));
    await logEvent(l.id, me.id, status === "CLOSED" ? "closed" : "reopened");
    return { ok: true };
  });
}
