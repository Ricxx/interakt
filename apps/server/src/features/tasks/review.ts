import { eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { orgNodes, sessionTasks, users } from "../../db/schema.js";

// Human-friendly key from the team name + the stable number, e.g. "MRKT-3" (or "T-3" with no team).
export function taskKey(nodeName: string | null, seq: number | null): string {
  if (seq == null) return "";
  const prefix = (nodeName ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase() || "T";
  return `${prefix}-${seq}`;
}

// The live payload for a Task Review activity: the whole team board (for referencing) + the
// spotlighted task with its subtasks. Reads straight from the standing tasks — no separate store.
export async function buildReviewPayload(activity: { id: string; config: { listNodeId?: string; spotlightTaskId?: string } | null }) {
  const cfg = activity.config ?? {};
  const listNodeId = cfg.listNodeId ?? null;
  const assignee = alias(users, "assignee");

  const conds = [eq(sessionTasks.activityId, activity.id)];
  if (listNodeId) conds.push(eq(sessionTasks.listNodeId, listNodeId));
  const rows = await db
    .select({
      id: sessionTasks.id,
      title: sessionTasks.title,
      status: sessionTasks.status,
      dueDate: sessionTasks.dueDate,
      seq: sessionTasks.seq,
      parentId: sessionTasks.parentId,
      assigneeId: sessionTasks.assigneeId,
      assigneeName: assignee.displayName,
      nodeName: orgNodes.name,
    })
    .from(sessionTasks)
    .leftJoin(orgNodes, eq(orgNodes.id, sessionTasks.listNodeId))
    .leftJoin(assignee, eq(assignee.id, sessionTasks.assigneeId))
    .where(or(...conds))
    .orderBy(sessionTasks.seq);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const card = (r: (typeof rows)[number]) => ({
    id: r.id,
    key: taskKey(r.nodeName, r.seq),
    title: r.title,
    status: r.status,
    dueDate: r.dueDate,
    assignee: r.assigneeId ? { id: r.assigneeId, name: r.assigneeName ?? "" } : null,
  });

  const board = rows.map((r) => ({ id: r.id, key: taskKey(r.nodeName, r.seq), title: r.title, status: r.status, parentId: r.parentId }));

  let spotlight = null;
  const sId = cfg.spotlightTaskId;
  if (sId && byId.has(sId)) {
    const s = byId.get(sId)!;
    const parent = s.parentId ? byId.get(s.parentId) : null;
    spotlight = {
      ...card(s),
      parentId: s.parentId,
      parentKey: parent ? taskKey(parent.nodeName, parent.seq) : null,
      subtasks: rows.filter((r) => r.parentId === s.id).map(card),
    };
  }

  return { listNodeId, spotlight, board };
}
