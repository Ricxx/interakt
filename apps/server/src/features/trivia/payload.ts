import { and, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { sessionParticipants, triviaSubmissions, users } from "../../db/schema.js";

// Flat reveal of every submission (for the session log of an ended trivia).
export async function triviaReveal(activityId: string) {
  const author = alias(users, "tr_author");
  const subs = await db
    .select({ authorName: author.displayName, format: triviaSubmissions.format, prompt: triviaSubmissions.prompt, answer: triviaSubmissions.answer, options: triviaSubmissions.options, correctIndex: triviaSubmissions.correctIndex })
    .from(triviaSubmissions)
    .innerJoin(author, eq(author.id, triviaSubmissions.authorId))
    .where(eq(triviaSubmissions.activityId, activityId));
  return subs.map((s) => ({
    authorName: s.authorName,
    prompt: s.prompt,
    options: s.options,
    correctIndex: s.format === "MC" ? s.correctIndex : null,
    answer: s.format === "MC" ? s.options?.[s.correctIndex ?? -1] ?? null : s.answer,
  }));
}

// The live payload for a Team Trivia activity, tailored per phase and per viewer.
// Answers stay hidden until the REVEALED phase.
export async function buildTriviaPayload(activity: { id: string; sessionId: string; config: { triviaPhase?: string; triviaDeadline?: string } | null }, meId: string) {
  const cfg = activity.config ?? {};
  const phase = (cfg.triviaPhase ?? "COLLECTING") as "COLLECTING" | "ASSIGNED" | "REVEALED";
  const author = alias(users, "t_author");
  const subs = await db
    .select({
      authorId: triviaSubmissions.authorId,
      authorName: author.displayName,
      format: triviaSubmissions.format,
      prompt: triviaSubmissions.prompt,
      answer: triviaSubmissions.answer,
      options: triviaSubmissions.options,
      correctIndex: triviaSubmissions.correctIndex,
      assignedToId: triviaSubmissions.assignedToId,
    })
    .from(triviaSubmissions)
    .innerJoin(author, eq(author.id, triviaSubmissions.authorId))
    .where(eq(triviaSubmissions.activityId, activity.id));

  const [{ c: joinedCount }] = await db
    .select({ c: count() })
    .from(sessionParticipants)
    .where(and(eq(sessionParticipants.sessionId, activity.sessionId), eq(sessionParticipants.state, "JOINED")));

  const mine = subs.find((s) => s.authorId === meId);
  const assigned = phase === "ASSIGNED" ? subs.find((s) => s.assignedToId === meId) : undefined;
  const answerOf = (s: (typeof subs)[number]) => (s.format === "MC" ? s.options?.[s.correctIndex ?? -1] ?? null : s.answer);

  return {
    phase,
    deadline: cfg.triviaDeadline ?? null,
    submittedCount: subs.length,
    joinedCount,
    submitters: subs.map((s) => s.authorName),
    mySubmission: mine ? { format: mine.format, prompt: mine.prompt, answer: mine.answer, options: mine.options, correctIndex: mine.correctIndex } : null,
    // The one I have to guess about (answer withheld).
    myAssignment: assigned ? { authorName: assigned.authorName, format: assigned.format, prompt: assigned.prompt, options: assigned.options } : null,
    reveal:
      phase === "REVEALED"
        ? subs.map((s) => ({ authorName: s.authorName, format: s.format, prompt: s.prompt, options: s.options, correctIndex: s.format === "MC" ? s.correctIndex : null, answer: answerOf(s) }))
        : null,
  };
}
