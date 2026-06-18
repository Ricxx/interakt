import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { quizzes, quizQuestions, quizAnswers, users } from "../../db/schema.js";

type Correct = { indices?: number[]; bool?: boolean; texts?: string[]; order?: number[]; value?: number; tolerance?: number; min?: number; max?: number } | null;
type Answer = { indices?: number[]; bool?: boolean; text?: string; order?: number[]; value?: number };
type Question = { id: string; type: string; prompt: string; options: string[] | null; correct: Correct; timeLimitSec: number; points: string; mediaKind: string | null; mediaUrl: string | null };

const BASE: Record<string, number> = { STANDARD: 1000, DOUBLE: 2000, NONE: 0 };
const norm = (s: string) => s.trim().toLowerCase();

export function isCorrect(q: Question, a: Answer): boolean {
  if (q.type === "MC") {
    const got = new Set(a.indices ?? []);
    const want = new Set(q.correct?.indices ?? []);
    return got.size === want.size && [...got].every((x) => want.has(x));
  }
  if (q.type === "TF") return a.bool === q.correct?.bool;
  if (q.type === "TYPE_ANSWER") return (q.correct?.texts ?? []).some((t) => norm(t) === norm(a.text ?? ""));
  if (q.type === "PUZZLE") return JSON.stringify(a.order ?? []) === JSON.stringify(q.correct?.order ?? []);
  if (q.type === "SLIDER") return a.value != null && Math.abs(a.value - (q.correct?.value ?? 0)) <= (q.correct?.tolerance ?? 0);
  return false;
}

// Grade an answer on submit: correctness × speed + streak bonus. Streak carries from the
// player's previous-question answer. Returns nothing useful to the player until reveal.
export async function gradeAndStore(activityId: string, q: Question, prevQuestionId: string | null, userId: string, answer: Answer, startedAtMs: number, nowMs: number) {
  const correct = isCorrect(q, answer);
  const base = BASE[q.points] ?? 1000;
  const limitMs = q.timeLimitSec * 1000;
  const responseMs = Math.max(0, nowMs - startedAtMs);
  let prevStreak = 0;
  if (prevQuestionId) {
    const [pa] = await db.select({ correct: quizAnswers.correct, streak: quizAnswers.streak }).from(quizAnswers).where(and(eq(quizAnswers.activityId, activityId), eq(quizAnswers.questionId, prevQuestionId), eq(quizAnswers.userId, userId)));
    if (pa?.correct) prevStreak = pa.streak;
  }
  const streak = correct ? prevStreak + 1 : 0;
  const speed = correct && base > 0 ? Math.round(base * (1 - Math.min(1, responseMs / limitMs) / 2)) : 0;
  const bonus = correct && base > 0 ? Math.min(prevStreak, 5) * 100 : 0; // up to +500 for a hot streak
  await db.insert(quizAnswers).values({ activityId, questionId: q.id, userId, answer, correct, points: speed + bonus, streak }).onConflictDoNothing();
}

export async function leaderboard(activityId: string, limit = 8) {
  const rows = await db
    .select({ userId: quizAnswers.userId, name: users.displayName, score: sql<number>`coalesce(sum(${quizAnswers.points}), 0)::int`, correct: sql<number>`count(*) filter (where ${quizAnswers.correct})::int` })
    .from(quizAnswers)
    .innerJoin(users, eq(users.id, quizAnswers.userId))
    .where(eq(quizAnswers.activityId, activityId))
    .groupBy(quizAnswers.userId, users.displayName)
    .orderBy(desc(sql`sum(${quizAnswers.points})`))
    .limit(limit);
  return rows.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, correct: r.correct }));
}

async function loadQuestions(quizId: string): Promise<Question[]> {
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).orderBy(quizQuestions.position);
  return qs.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, timeLimitSec: q.timeLimitSec, points: q.points, mediaKind: q.mediaKind, mediaUrl: q.mediaUrl }));
}

// Deterministic shuffle (seeded by id) so every client + refetch sees the same order.
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// What players see DURING a question — never the correct answer.
function publicQuestion(q: Question, deadline: string | null) {
  const base = { id: q.id, type: q.type, prompt: q.prompt, mediaKind: q.mediaKind, mediaUrl: q.mediaUrl, points: q.points, timeLimitSec: q.timeLimitSec, deadline };
  if (q.type === "PUZZLE") {
    const shuffled = seededShuffle((q.options ?? []).map((label, i) => ({ label, i })), q.id);
    return { ...base, options: shuffled.map((x) => x.label), optionIdx: shuffled.map((x) => x.i) }; // optionIdx = original index of each shown item
  }
  if (q.type === "SLIDER") return { ...base, options: [], slider: { min: q.correct?.min ?? 0, max: q.correct?.max ?? 100 } };
  return { ...base, options: q.options ?? [] }; // MC choices; TF/TYPE_ANSWER none
}

// Human-readable correct answer, shown at reveal.
function answerText(q: Question): string {
  if (q.type === "MC") return (q.correct?.indices ?? []).map((i) => (q.options ?? [])[i]).filter(Boolean).join(", ");
  if (q.type === "TF") return q.correct?.bool ? "True" : "False";
  if (q.type === "TYPE_ANSWER") return (q.correct?.texts ?? []).join(" / ");
  if (q.type === "PUZZLE") return (q.options ?? []).join(" → ");
  if (q.type === "SLIDER") { const tol = q.correct?.tolerance ?? 0; return tol ? `${q.correct?.value} (±${tol})` : String(q.correct?.value ?? ""); }
  return "";
}

// Phase-tailored payload for the QUIZ activity.
export async function buildQuizPayload(activity: { id: string; config: { quizId?: string; quizPhase?: string; quizIdx?: number; quizStartedAt?: string; quizDeadline?: string } | null }, meId: string, canControl: boolean) {
  const cfg = activity.config ?? {};
  if (!cfg.quizId) return null;
  const [quiz] = await db.select({ title: quizzes.title }).from(quizzes).where(eq(quizzes.id, cfg.quizId));
  const questions = await loadQuestions(cfg.quizId);
  const phase = cfg.quizPhase ?? "LOBBY";
  const idx = cfg.quizIdx ?? -1;
  const base = { title: quiz?.title ?? "Quiz", phase, idx, total: questions.length };

  if (phase === "LOBBY") return { ...base };
  if (phase === "PODIUM") return { ...base, leaderboard: await leaderboard(activity.id) };

  const q = questions[idx];
  if (!q) return { ...base, phase: "PODIUM", leaderboard: await leaderboard(activity.id) };
  const [mine] = await db.select({ correct: quizAnswers.correct, points: quizAnswers.points }).from(quizAnswers).where(and(eq(quizAnswers.activityId, activity.id), eq(quizAnswers.questionId, q.id), eq(quizAnswers.userId, meId)));

  if (phase === "QUESTION") {
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(quizAnswers).where(and(eq(quizAnswers.activityId, activity.id), eq(quizAnswers.questionId, q.id)));
    return { ...base, question: publicQuestion(q, cfg.quizDeadline ?? null), myAnswered: !!mine, answerCount: canControl ? c : undefined };
  }

  // REVEAL
  const answers = await db.select({ answer: quizAnswers.answer, correct: quizAnswers.correct }).from(quizAnswers).where(and(eq(quizAnswers.activityId, activity.id), eq(quizAnswers.questionId, q.id)));
  let perOption: number[] | undefined;
  if (q.type === "MC") { perOption = (q.options ?? []).map((_, i) => answers.filter((a) => (a.answer?.indices ?? []).includes(i)).length); }
  else if (q.type === "TF") { perOption = [answers.filter((a) => a.answer?.bool === true).length, answers.filter((a) => a.answer?.bool === false).length]; }
  return {
    ...base,
    question: { id: q.id, type: q.type, prompt: q.prompt, options: q.options ?? [], mediaKind: q.mediaKind, mediaUrl: q.mediaUrl },
    answerText: answerText(q),
    distribution: { total: answers.length, correctCount: answers.filter((a) => a.correct).length, perOption },
    leaderboard: await leaderboard(activity.id),
    myResult: mine ? { correct: mine.correct, points: mine.points } : { correct: false, points: 0 },
    isLast: idx === questions.length - 1,
  };
}

// Final standings for the session log.
export async function quizResults(activityId: string) {
  return { leaderboard: await leaderboard(activityId, 20) };
}
