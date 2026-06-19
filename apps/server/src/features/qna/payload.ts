import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { qnaQuestions, qnaUpvotes, users } from "../../db/schema.js";

type Activity = { id: string; config: { anonymous?: boolean } | null };

// Live Q&A payload. Open questions float to the top by upvotes; answered ones sink. When the activity
// is anonymous, asker names are hidden from everyone (the asker still sees their own as "mine").
export async function buildQnaPayload(activity: Activity, meId: string, canModerate: boolean) {
  const anon = activity.config?.anonymous === true;
  const rows = await db
    .select({ id: qnaQuestions.id, body: qnaQuestions.body, authorId: qnaQuestions.authorId, answered: qnaQuestions.answered, createdAt: qnaQuestions.createdAt, authorName: users.displayName })
    .from(qnaQuestions)
    .innerJoin(users, eq(users.id, qnaQuestions.authorId))
    .where(eq(qnaQuestions.activityId, activity.id));

  const ids = rows.map((r) => r.id);
  const ups = ids.length ? await db.select({ q: qnaUpvotes.questionId, u: qnaUpvotes.userId }).from(qnaUpvotes).where(inArray(qnaUpvotes.questionId, ids)) : [];
  const countOf = (id: string) => ups.filter((x) => x.q === id).length;

  const questions = rows
    .map((r) => ({
      id: r.id,
      body: r.body,
      answered: r.answered,
      mine: r.authorId === meId,
      authorName: anon ? null : r.authorName,
      upvotes: countOf(r.id),
      myUpvote: ups.some((x) => x.q === r.id && x.u === meId),
    }))
    // open first, then most-upvoted, then oldest
    .sort((a, b) => Number(a.answered) - Number(b.answered) || b.upvotes - a.upvotes || rows.findIndex((r) => r.id === a.id) - rows.findIndex((r) => r.id === b.id));

  return { anonymous: anon, canModerate, total: questions.length, open: questions.filter((q) => !q.answered).length, questions };
}
