import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { wordcloudEntries } from "../../db/schema.js";

type Activity = { id: string; title: string; config: { maxPerPerson?: number } | null };

// Aggregate submissions by word (already normalized on the way in), most frequent first.
async function tally(activityId: string) {
  const rows = await db.select({ word: wordcloudEntries.word, userId: wordcloudEntries.userId }).from(wordcloudEntries).where(eq(wordcloudEntries.activityId, activityId));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.word, (counts.get(r.word) ?? 0) + 1);
  const words = [...counts.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count);
  return { rows, words };
}

// Live payload, tailored to the viewer (so they know how many of their own words remain).
export async function buildWordcloudPayload(activity: Activity, meId: string) {
  const { rows, words } = await tally(activity.id);
  const maxPerPerson = activity.config?.maxPerPerson ?? 3;
  return {
    prompt: activity.title,
    words,
    total: rows.length,
    mineCount: rows.filter((r) => r.userId === meId).length,
    maxPerPerson,
  };
}

// Final cloud for the session log.
export async function wordcloudResults(activity: Activity) {
  const { rows, words } = await tally(activity.id);
  return { prompt: activity.title, words, total: rows.length };
}
