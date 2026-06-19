import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { fistVotes } from "../../db/schema.js";

const SCALE = 5;
type Activity = { id: string; title: string };

// Fist-of-Five tally: the distribution across 1–5, the average, and the viewer's own vote. Always live.
export async function buildFistPayload(activity: Activity, meId: string) {
  const rows = await db.select({ voterId: fistVotes.voterId, value: fistVotes.value }).from(fistVotes).where(eq(fistVotes.activityId, activity.id));
  const distribution = Array.from({ length: SCALE }, (_, i) => ({ value: i + 1, count: rows.filter((r) => r.value === i + 1).length }));
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((a, r) => a + r.value, 0) / count) * 10) / 10 : 0;
  return { prompt: activity.title, scale: SCALE, count, average, distribution, myVote: rows.find((r) => r.voterId === meId)?.value ?? null };
}
