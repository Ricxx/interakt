import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { checklistTicks, users } from "../../db/schema.js";

type Activity = { id: string; config: { checklistItems?: string[] } | null };

// Checklist payload — each item with whether it's ticked, and who ticked it (+ when), for accountability.
export async function buildChecklistPayload(activity: Activity) {
  const items = activity.config?.checklistItems ?? [];
  const ticks = await db
    .select({ itemIndex: checklistTicks.itemIndex, checkedAt: checklistTicks.checkedAt, byName: users.displayName })
    .from(checklistTicks)
    .innerJoin(users, eq(users.id, checklistTicks.checkedBy))
    .where(eq(checklistTicks.activityId, activity.id));
  const byIdx = new Map(ticks.map((t) => [t.itemIndex, t]));
  const out = items.map((label, index) => {
    const t = byIdx.get(index);
    return { index, label, checked: !!t, byName: t?.byName ?? null, at: t ? new Date(t.checkedAt).toISOString() : null };
  });
  return { items: out, done: out.filter((i) => i.checked).length, total: out.length };
}
