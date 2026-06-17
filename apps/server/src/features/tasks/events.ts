import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { orgNodes, sessionTasks, taskEvents } from "../../db/schema.js";
import { taskKey } from "./review.js";

// Append a task-change event. Captures the task's key (and its parent's, as "related") at write
// time so the feed line still reads correctly after the task is deleted. Call before a delete.
export async function recordTaskEvent(actorId: string, action: "created" | "updated" | "completed" | "removed", taskId: string) {
  const parent = alias(sessionTasks, "ev_parent");
  const node = alias(orgNodes, "ev_node");
  const parentNode = alias(orgNodes, "ev_parent_node");
  const [t] = await db
    .select({ seq: sessionTasks.seq, listNodeId: sessionTasks.listNodeId, nodeName: node.name, parentSeq: parent.seq, parentNodeName: parentNode.name })
    .from(sessionTasks)
    .leftJoin(node, eq(node.id, sessionTasks.listNodeId))
    .leftJoin(parent, eq(parent.id, sessionTasks.parentId))
    .leftJoin(parentNode, eq(parentNode.id, parent.listNodeId))
    .where(eq(sessionTasks.id, taskId));
  if (!t) return;
  await db.insert(taskEvents).values({
    actorId,
    action,
    taskKey: taskKey(t.nodeName, t.seq),
    relatedKey: t.parentSeq != null ? taskKey(t.parentNodeName, t.parentSeq) : null,
    listNodeId: t.listNodeId ?? null,
  });
}
