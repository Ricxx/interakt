import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { brainstormIdeas, brainstormLikes, brainstormComments, users } from "../db/schema.js";

// Ideas (with likes, my-like, comment counts) for a brainstorm activity or a board.
export async function listIdeas(filter: { activityId?: string; boardId?: string }, meId: string) {
  const where = filter.activityId ? eq(brainstormIdeas.activityId, filter.activityId) : eq(brainstormIdeas.boardId, filter.boardId!);
  const ideaRows = await db
    .select({ id: brainstormIdeas.id, title: brainstormIdeas.title, body: brainstormIdeas.body, authorName: users.displayName, createdAt: brainstormIdeas.createdAt })
    .from(brainstormIdeas)
    .innerJoin(users, eq(users.id, brainstormIdeas.userId))
    .where(where);
  const ids = ideaRows.map((i) => i.id);
  const likes = ids.length ? await db.select({ ideaId: brainstormLikes.ideaId, userId: brainstormLikes.userId }).from(brainstormLikes).where(inArray(brainstormLikes.ideaId, ids)) : [];
  const comments = ids.length ? await db.select({ ideaId: brainstormComments.ideaId }).from(brainstormComments).where(inArray(brainstormComments.ideaId, ids)) : [];
  const likeCount = new Map<string, number>();
  const myLikes = new Set<string>();
  for (const l of likes) {
    likeCount.set(l.ideaId, (likeCount.get(l.ideaId) ?? 0) + 1);
    if (l.userId === meId) myLikes.add(l.ideaId);
  }
  const commentCount = new Map<string, number>();
  for (const c of comments) commentCount.set(c.ideaId, (commentCount.get(c.ideaId) ?? 0) + 1);
  return ideaRows.map((i) => ({
    id: i.id,
    title: i.title,
    body: i.body,
    authorName: i.authorName,
    createdAt: i.createdAt.toISOString(),
    likes: likeCount.get(i.id) ?? 0,
    likedByMe: myLikes.has(i.id),
    comments: commentCount.get(i.id) ?? 0,
  }));
}
