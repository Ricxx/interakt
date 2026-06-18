import type { FastifyInstance } from "fastify";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { surveys, surveyQuestions, surveyResponses, surveyAnswers, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { editSurvey, ownSurvey } from "./routes.js";

const K = 5; // k-anonymity floor for anonymous surveys
type AnswerVal = { choice?: number; choices?: number[]; text?: string; scale?: number; other?: string } | null;

async function submittedResponses(surveyId: string) {
  return db.select({ id: surveyResponses.id, respondentId: surveyResponses.respondentId }).from(surveyResponses).where(and(eq(surveyResponses.surveyId, surveyId), eq(surveyResponses.status, "SUBMITTED")));
}

// Per-question aggregates over submitted responses, tailored to the question type.
function aggregate(q: { id: string; type: string; options: string[] | null; prompt: string }, values: AnswerVal[]) {
  const base = { id: q.id, type: q.type, prompt: q.prompt, options: q.options ?? [], answered: values.length };
  if (q.type === "SINGLE" || q.type === "MULTI") {
    const counts = (q.options ?? []).map(() => 0);
    const otherTexts: string[] = [];
    for (const v of values) {
      if (!v) continue;
      const picks = q.type === "SINGLE" ? (v.choice != null && v.choice >= 0 ? [v.choice] : []) : v.choices ?? [];
      for (const i of picks) if (counts[i] !== undefined) counts[i]++;
      if (v.other?.trim()) otherTexts.push(v.other.trim());
    }
    return { ...base, counts, otherTexts, otherCount: otherTexts.length };
  }
  if (q.type === "SCALE") {
    const dist = [0, 0, 0, 0, 0]; // 1..5
    let sum = 0, n = 0;
    for (const v of values) if (v?.scale != null && v.scale >= 1 && v.scale <= 5) { dist[v.scale - 1]++; sum += v.scale; n++; }
    return { ...base, dist, average: n ? Math.round((sum / n) * 100) / 100 : null };
  }
  // TEXT
  return { ...base, texts: values.map((v) => v?.text?.trim()).filter((t): t is string => !!t) };
}

function fmt(q: { type: string; options: string[] | null }, v: AnswerVal): string {
  if (!v) return "";
  const opts = q.options ?? [];
  if (q.type === "SINGLE") return v.choice === -1 || v.choice == null ? (v.other ? `Other: ${v.other}` : "") : opts[v.choice] ?? "";
  if (q.type === "MULTI") return [...(v.choices ?? []).map((i) => opts[i] ?? ""), v.other ? `Other: ${v.other}` : ""].filter(Boolean).join("; ");
  if (q.type === "SCALE") return v.scale != null ? String(v.scale) : "";
  return v.text ?? "";
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function surveyResultsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/surveys/:id/results", { preHandler: requireAuth }, async (req, reply) => {
    const s = await editSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const resps = await submittedResponses(s.id);
    // k-anonymity: anonymous results stay hidden until there are enough to be non-identifying.
    if (s.anonymity === "ANON" && resps.length < K) return { anonymity: s.anonymity, submitted: resps.length, locked: true, k: K };
    const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(asc(surveyQuestions.position));
    const ids = resps.map((r) => r.id);
    const answers = ids.length ? await db.select({ responseId: surveyAnswers.responseId, questionId: surveyAnswers.questionId, value: surveyAnswers.value }).from(surveyAnswers).where(inArray(surveyAnswers.responseId, ids)) : [];
    const byQ = new Map<string, AnswerVal[]>();
    for (const a of answers) byQ.set(a.questionId, [...(byQ.get(a.questionId) ?? []), a.value]);
    return { anonymity: s.anonymity, submitted: resps.length, locked: false, questions: qs.map((q) => aggregate(q, byQ.get(q.id) ?? [])) };
  });

  // CSV export (owner/admin, audited). One row per response; "Other" answers included.
  // Anonymous exports carry NO identity and respect the same k floor.
  app.get<{ Params: { id: string } }>("/api/surveys/:id/results.csv", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const s = await ownSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const resps = await submittedResponses(s.id);
    if (s.anonymity === "ANON" && resps.length < K) return reply.code(409).send({ error: "k_anonymity", k: K });
    const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(asc(surveyQuestions.position));
    const ids = resps.map((r) => r.id);
    const answers = ids.length ? await db.select({ responseId: surveyAnswers.responseId, questionId: surveyAnswers.questionId, value: surveyAnswers.value }).from(surveyAnswers).where(inArray(surveyAnswers.responseId, ids)) : [];
    const cell = new Map<string, AnswerVal>();
    for (const a of answers) cell.set(`${a.responseId}:${a.questionId}`, a.value);
    // Respondent names for NAMED surveys.
    const names = new Map<string, string>();
    if (s.anonymity !== "ANON") {
      const uids = resps.map((r) => r.respondentId).filter((x): x is string => !!x);
      if (uids.length) for (const u of await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, uids))) names.set(u.id, u.name);
    }
    const header = ["Respondent", ...qs.map((q) => q.prompt)];
    const rows = resps.map((r) => [s.anonymity === "ANON" ? "Anonymous" : names.get(r.respondentId ?? "") ?? "—", ...qs.map((q) => fmt(q, cell.get(`${r.id}:${q.id}`) ?? null))]);
    await recordAudit({ action: "survey.exported", tenantId: me.tenantId, actorId: me.id, meta: { surveyId: s.id, responses: resps.length } });
    const csv = [header, ...rows].map((row) => row.map((c) => csvCell(String(c))).join(",")).join("\n");
    return reply.header("content-type", "text/csv").header("content-disposition", `attachment; filename="survey-${s.id}.csv"`).send(csv);
  });
}
