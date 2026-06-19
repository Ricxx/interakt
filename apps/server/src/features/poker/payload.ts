import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pokerVotes, users } from "../../db/schema.js";

export const POKER_DECK = ["1", "2", "3", "5", "8", "13", "21", "?"];
type Activity = { id: string; title: string; config: { deck?: string[]; pokerRevealed?: boolean } | null };

// Planning-poker payload. Before reveal everyone sees WHO has voted but not their card; after reveal,
// each person's card + the distribution + a consensus flag (everyone played the same card).
export async function buildPokerPayload(activity: Activity, meId: string) {
  const cfg = activity.config ?? {};
  const deck = cfg.deck ?? POKER_DECK;
  const revealed = cfg.pokerRevealed === true;
  const rows = await db
    .select({ voterId: pokerVotes.voterId, card: pokerVotes.card, name: users.displayName })
    .from(pokerVotes)
    .innerJoin(users, eq(users.id, pokerVotes.voterId))
    .where(eq(pokerVotes.activityId, activity.id));

  const voters = rows.map((r) => ({ name: r.name, card: revealed ? r.card : null }));
  const distribution = revealed ? deck.map((card) => ({ card, count: rows.filter((r) => r.card === card).length })).filter((d) => d.count > 0) : null;

  return {
    prompt: activity.title,
    deck,
    revealed,
    votedCount: rows.length,
    myCard: rows.find((r) => r.voterId === meId)?.card ?? null,
    voters,
    distribution,
    consensus: revealed && rows.length > 1 && new Set(rows.map((r) => r.card)).size === 1,
  };
}
