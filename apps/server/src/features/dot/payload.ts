import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { dotVotes } from "../../db/schema.js";

type Activity = { id: string; title: string; config: { dotOptions?: string[]; dotBudget?: number } | null };

// Live dot-voting tally. Everyone sees the totals build up; each viewer also gets their own allocation
// and how many dots they have left to spend.
export async function buildDotPayload(activity: Activity, meId: string) {
  const cfg = activity.config ?? {};
  const options = cfg.dotOptions ?? [];
  const budget = cfg.dotBudget ?? 5;
  const rows = await db.select({ optionIndex: dotVotes.optionIndex, voterId: dotVotes.voterId, dots: dotVotes.dots }).from(dotVotes).where(eq(dotVotes.activityId, activity.id));

  const totals = options.map((_, i) => rows.filter((r) => r.optionIndex === i).reduce((a, r) => a + r.dots, 0));
  const mine = options.map((_, i) => rows.find((r) => r.voterId === meId && r.optionIndex === i)?.dots ?? 0);
  const myUsed = mine.reduce((a, b) => a + b, 0);

  return {
    question: activity.title,
    budget,
    voterCount: new Set(rows.map((r) => r.voterId)).size,
    totalDots: totals.reduce((a, b) => a + b, 0),
    myUsed,
    myRemaining: budget - myUsed,
    options: options.map((label, index) => ({ index, label, dots: totals[index], mine: mine[index] })),
  };
}
