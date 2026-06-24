import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { retroCards, retroCardVotes, users } from "../../db/schema.js";

type Activity = { id: string; config: { retroColumns?: string[]; anonymous?: boolean } | null };

// Retro payload — cards grouped by column, most-upvoted first. Anonymous mode hides authors from
// everyone (the author still sees their own as "mine").
export async function buildRetroPayload(activity: Activity, meId: string, canModerate: boolean) {
  const cfg = activity.config ?? {};
  const titles = cfg.retroColumns ?? ["Start", "Stop", "Continue"];
  const anon = cfg.anonymous === true;
  const rows = await db
    .select({ id: retroCards.id, column: retroCards.column, body: retroCards.body, authorId: retroCards.authorId, authorName: users.displayName })
    .from(retroCards)
    .innerJoin(users, eq(users.id, retroCards.authorId))
    .where(eq(retroCards.activityId, activity.id));

  const ids = rows.map((r) => r.id);
  const votes = ids.length ? await db.select({ c: retroCardVotes.cardId, u: retroCardVotes.userId }).from(retroCardVotes).where(inArray(retroCardVotes.cardId, ids)) : [];

  const card = (r: (typeof rows)[number]) => ({
    id: r.id,
    body: r.body,
    mine: r.authorId === meId,
    canDelete: canModerate || r.authorId === meId,
    authorName: anon ? null : r.authorName,
    votes: votes.filter((v) => v.c === r.id).length,
    myVote: votes.some((v) => v.c === r.id && v.u === meId),
  });

  const columns = titles.map((title, index) => ({
    index,
    title,
    cards: rows.filter((r) => r.column === index).map(card).sort((a, b) => b.votes - a.votes),
  }));

  return { anonymous: anon, canModerate, columns };
}
