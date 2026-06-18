import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { activities, orgNodes, sessions, sessionTasks, taskEvents, taskReads, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { taskKey } from "./review.js";
import { recordTaskEvent } from "./events.js";

// The node + all its ancestors — the set of standing lists a person belongs to (team → dept → division → org).
async function scopeNodes(tenantId: string, nodeId: string | null): Promise<Set<string>> {
  const set = new Set<string>();
  if (!nodeId) return set;
  const nodes = await db.select({ id: orgNodes.id, parentId: orgNodes.parentId }).from(orgNodes).where(eq(orgNodes.tenantId, tenantId));
  const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
  let cur: string | null = nodeId;
  let guard = 0;
  while (cur && guard++ < 30) { set.add(cur); cur = parent.get(cur) ?? null; }
  return set;
}

async function myNodeId(userId: string): Promise<string | null> {
  const [u] = await db.select({ nodeId: users.nodeId }).from(users).where(eq(users.id, userId));
  return u?.nodeId ?? null;
}

// You may act on a task if it's on a team list you belong to, it's assigned to you, or you created it.
function canAct(task: { listNodeId: string | null; assigneeId: string | null; createdBy: string }, meId: string, myScope: Set<string>): boolean {
  return (!!task.listNodeId && myScope.has(task.listNodeId)) || task.assigneeId === meId || task.createdBy === meId;
}

export function taskRoutes(app: FastifyInstance) {
  // My standing task list: tasks on a team/dept I belong to, assigned to me, or created by me.
  app.get("/api/tasks/mine", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const mine = await scopeNodes(me.tenantId, await myNodeId(me.id));
    const conds = [eq(sessionTasks.assigneeId, me.id), eq(sessionTasks.createdBy, me.id)];
    if (mine.size) conds.push(inArray(sessionTasks.listNodeId, [...mine]));

    const assignee = alias(users, "assignee");
    const creator = alias(users, "creator");
    const parent = alias(sessionTasks, "parent");
    const parentNode = alias(orgNodes, "parent_node");
    const rows = await db
      .select({
        id: sessionTasks.id,
        title: sessionTasks.title,
        status: sessionTasks.status,
        dueDate: sessionTasks.dueDate,
        createdAt: sessionTasks.createdAt,
        seq: sessionTasks.seq,
        parentId: sessionTasks.parentId,
        assigneeId: sessionTasks.assigneeId,
        assigneeName: assignee.displayName,
        byName: creator.displayName,
        listName: orgNodes.name,
        sessionTitle: sessions.title,
        parentSeq: parent.seq,
        parentNodeName: parentNode.name,
      })
      .from(sessionTasks)
      .leftJoin(activities, eq(activities.id, sessionTasks.activityId))
      .leftJoin(sessions, eq(sessions.id, activities.sessionId))
      .leftJoin(orgNodes, eq(orgNodes.id, sessionTasks.listNodeId))
      .leftJoin(assignee, eq(assignee.id, sessionTasks.assigneeId))
      .leftJoin(creator, eq(creator.id, sessionTasks.createdBy))
      .leftJoin(parent, eq(parent.id, sessionTasks.parentId))
      .leftJoin(parentNode, eq(parentNode.id, parent.listNodeId))
      .where(or(...conds))
      .orderBy(desc(sessionTasks.createdAt));

    const childCount = new Map<string, number>();
    for (const r of rows) if (r.parentId) childCount.set(r.parentId, (childCount.get(r.parentId) ?? 0) + 1);

    return {
      tasks: rows.map((t) => ({
        id: t.id,
        key: taskKey(t.listName, t.seq),
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
        byName: t.byName ?? "",
        listName: t.listName ?? "My tasks",
        sessionTitle: t.sessionTitle ?? null,
        assignee: t.assigneeId ? { id: t.assigneeId, name: t.assigneeName ?? "" } : null,
        assignedToMe: t.assigneeId === me.id,
        parentId: t.parentId,
        parentKey: t.parentId ? taskKey(t.parentNodeName, t.parentSeq) : null,
        subtaskCount: childCount.get(t.id) ?? 0,
      })),
    };
  });

  // People you may pick as an assignee (the tenant's members).
  app.get("/api/tasks/people", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.tenantId, me.tenantId)).orderBy(users.displayName);
    return { people: rows };
  });

  // Add a task straight to my team board (no session needed).
  app.post("/api/tasks", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), assigneeId: z.string().uuid().nullish(), dueDate: z.string().date().nullish(), parentId: z.string().uuid().nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [created] = await db
      .insert(sessionTasks)
      .values({
        title: body.data.title,
        assigneeId: body.data.assigneeId ?? null,
        dueDate: body.data.dueDate ?? null,
        parentId: body.data.parentId ?? null,
        createdBy: me.id,
        listNodeId: await myNodeId(me.id),
      })
      .returning({ id: sessionTasks.id });
    await recordTaskEvent(me.id, "created", created.id);
    return { ok: true };
  });

  // Edit a task: status, assignee, title, or due date.
  app.patch<{ Params: { id: string } }>("/api/tasks/:id", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ status: z.enum(["TODO", "DOING", "DONE"]).optional(), assigneeId: z.string().uuid().nullish(), title: z.string().min(1).max(200).optional(), dueDate: z.string().date().nullish(), parentId: z.string().uuid().nullish() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;

    const [task] = await db.select({ id: sessionTasks.id, listNodeId: sessionTasks.listNodeId, assigneeId: sessionTasks.assigneeId, createdBy: sessionTasks.createdBy }).from(sessionTasks).where(eq(sessionTasks.id, req.params.id));
    if (!task) return reply.code(404).send({ error: "not_found" });
    if (!canAct(task, me.id, await scopeNodes(me.tenantId, await myNodeId(me.id)))) return reply.code(403).send({ error: "not_allowed" });

    const patch: Record<string, unknown> = {};
    if (body.data.status) patch.status = body.data.status;
    if (body.data.assigneeId !== undefined) patch.assigneeId = body.data.assigneeId;
    if (body.data.title !== undefined) patch.title = body.data.title;
    if (body.data.dueDate !== undefined) patch.dueDate = body.data.dueDate;
    if (body.data.parentId !== undefined) patch.parentId = body.data.parentId; // re-parent (or null to detach)
    if (Object.keys(patch).length === 0) return { ok: true };
    await db.update(sessionTasks).set(patch).where(eq(sessionTasks.id, task.id));
    await recordTaskEvent(me.id, body.data.status === "DONE" ? "completed" : "updated", task.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/tasks/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [task] = await db.select({ id: sessionTasks.id, listNodeId: sessionTasks.listNodeId, assigneeId: sessionTasks.assigneeId, createdBy: sessionTasks.createdBy }).from(sessionTasks).where(eq(sessionTasks.id, req.params.id));
    if (!task) return reply.code(404).send({ error: "not_found" });
    if (!canAct(task, me.id, await scopeNodes(me.tenantId, await myNodeId(me.id)))) return reply.code(403).send({ error: "not_allowed" });
    await recordTaskEvent(me.id, "removed", task.id); // before delete, while the key is still resolvable
    await db.delete(sessionTasks).where(eq(sessionTasks.id, task.id));
    return { ok: true };
  });

  // Activity feed: recent task changes on my units (plus my own actions). limit defaults to 30.
  app.get<{ Querystring: { limit?: string } }>("/api/tasks/feed", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const mine = await scopeNodes(me.tenantId, await myNodeId(me.id));
    const conds = [eq(taskEvents.actorId, me.id)];
    if (mine.size) conds.push(inArray(taskEvents.listNodeId, [...mine]));
    const rows = await db
      .select({ id: taskEvents.id, action: taskEvents.action, taskKey: taskEvents.taskKey, relatedKey: taskEvents.relatedKey, createdAt: taskEvents.createdAt, actorName: users.displayName })
      .from(taskEvents)
      .innerJoin(users, eq(users.id, taskEvents.actorId))
      .where(or(...conds))
      .orderBy(desc(taskEvents.createdAt))
      .limit(limit);
    return { events: rows.map((r) => ({ id: r.id, actorName: r.actorName, action: r.action, taskKey: r.taskKey, relatedKey: r.relatedKey, at: r.createdAt.toISOString() })) };
  });

  // Count of task changes by OTHERS in your units since you last opened the board (nav badge).
  app.get("/api/tasks/unread", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const mine = await scopeNodes(me.tenantId, await myNodeId(me.id));
    if (!mine.size) return { count: 0 };
    const [read] = await db.select({ at: taskReads.lastSeenAt }).from(taskReads).where(eq(taskReads.userId, me.id));
    const since = read?.at ?? new Date(0);
    const [row] = await db
      .select({ c: count() })
      .from(taskEvents)
      .where(and(inArray(taskEvents.listNodeId, [...mine]), ne(taskEvents.actorId, me.id), gt(taskEvents.createdAt, since)));
    return { count: row?.c ?? 0 };
  });

  // Opening the board clears the badge.
  app.post("/api/tasks/read", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    await db
      .insert(taskReads)
      .values({ userId: me.id })
      .onConflictDoUpdate({ target: taskReads.userId, set: { lastSeenAt: new Date() } });
    return { ok: true };
  });
}
