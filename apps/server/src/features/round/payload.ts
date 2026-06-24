import { inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";

type Activity = { config: { roundOrder?: string[]; roundIndex?: number } | null };

// Round-robin payload — the speaking order with done/current flags, and whose turn it is now.
export async function buildRoundPayload(activity: Activity, meId: string) {
  const cfg = activity.config ?? {};
  const order = cfg.roundOrder ?? [];
  const idx = cfg.roundIndex ?? 0;
  const names = order.length ? await db.select({ id: users.id, n: users.displayName }).from(users).where(inArray(users.id, order)) : [];
  const nameOf = new Map(names.map((u) => [u.id, u.n] as const));
  const items = order.map((uid, i) => ({ name: nameOf.get(uid) ?? "?", done: i < idx, current: i === idx, mine: uid === meId }));
  const currentId = order[idx] ?? null;
  return { items, index: idx, total: order.length, currentName: currentId ? nameOf.get(currentId) ?? "?" : null, currentMine: currentId === meId, finished: idx >= order.length };
}
