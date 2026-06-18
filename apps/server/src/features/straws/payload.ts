import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { straws, users } from "../../db/schema.js";

async function strawRows(activityId: string) {
  return db
    .select({ idx: straws.idx, length: straws.length, pickedBy: straws.pickedBy, pickerName: users.displayName })
    .from(straws)
    .leftJoin(users, eq(users.id, straws.pickedBy))
    .where(eq(straws.activityId, activityId));
}

// Live draw-straws payload. Unpicked straws hide their length (they look identical);
// picked ones reveal it. A ranking (shortest first) builds up as people draw.
export async function buildStrawsPayload(activityId: string, meId: string) {
  const rows = (await strawRows(activityId)).sort((a, b) => a.idx - b.idx);
  const picked = rows.filter((r) => r.pickedBy);
  const ranking = picked
    .map((r) => ({ name: r.pickerName ?? "—", length: r.length }))
    .sort((a, b) => a.length - b.length);
  return {
    straws: rows.map((r) => ({ idx: r.idx, picked: !!r.pickedBy, pickerName: r.pickedBy ? r.pickerName : null, length: r.pickedBy ? r.length : null })),
    total: rows.length,
    drawnCount: picked.length,
    iDrew: rows.some((r) => r.pickedBy === meId),
    done: rows.length > 0 && picked.length === rows.length,
    ranking,
  };
}

// Final ranking for the session log.
export async function strawsResults(activityId: string) {
  const rows = await strawRows(activityId);
  const ranking = rows
    .filter((r) => r.pickedBy)
    .map((r) => ({ name: r.pickerName ?? "—", length: r.length }))
    .sort((a, b) => a.length - b.length);
  return { total: rows.length, ranking };
}
