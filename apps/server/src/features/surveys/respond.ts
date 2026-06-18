import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { surveys, surveyQuestions, surveySections, surveyResponses, surveyAnswers } from "../../db/schema.js";
import { requireAuth, type CurrentUser } from "../../auth.js";
import { isAssigned } from "./routes.js";

type Survey = typeof surveys.$inferSelect;
const today = () => new Date().toISOString().slice(0, 10); // coarse day, never precise time
const answerValue = z.object({ choice: z.number().int().optional(), choices: z.array(z.number().int()).optional(), text: z.string().max(4000).optional(), scale: z.number().int().optional(), other: z.string().max(500).optional() });

// An OPEN survey the caller is in the audience for, or null.
async function openAssigned(id: string, user: CurrentUser): Promise<Survey | null> {
  const [s] = await db.select().from(surveys).where(and(eq(surveys.id, id), eq(surveys.tenantId, user.tenantId)));
  if (!s || s.status !== "OPEN" || !(await isAssigned(s, user.id))) return null;
  return s;
}

// The caller's response: NAMED keyed by user, ANON by their claim ticket.
type AnswerVal = { choice?: number; choices?: number[]; text?: string; scale?: number; other?: string };

// The caller's response: NAMED keyed by user, ANON by their claim ticket. Shared by the
// org-scope respond routes and the in-session SURVEY activity.
export async function findResponse(survey: Survey, user: CurrentUser, ticket?: string) {
  if (survey.anonymity === "ANON") {
    if (!ticket) return null;
    const [r] = await db.select().from(surveyResponses).where(and(eq(surveyResponses.surveyId, survey.id), eq(surveyResponses.pseudonymRef, ticket)));
    return r ?? null;
  }
  const [r] = await db.select().from(surveyResponses).where(and(eq(surveyResponses.surveyId, survey.id), eq(surveyResponses.respondentId, user.id)));
  return r ?? null;
}

function isAnswered(type: string, v: AnswerVal | null): boolean {
  if (!v) return false;
  if (type === "SINGLE") return v.choice != null || !!v.other?.trim();
  if (type === "MULTI") return (v.choices?.length ?? 0) > 0 || !!v.other?.trim();
  if (type === "TEXT") return !!v.text?.trim();
  if (type === "SCALE") return v.scale != null;
  return false;
}

// Create/resume a response and upsert a page of answers. Returns the claim ticket (anon).
export async function saveAnswers(survey: Survey, user: CurrentUser, opts: { ticket?: string; page?: number; answers: { questionId: string; value: AnswerVal }[] }): Promise<{ error: string } | { ticket?: string }> {
  let resp = await findResponse(survey, user, opts.ticket);
  if (resp?.status === "SUBMITTED") return { error: "already_submitted" };
  let ticket = opts.ticket;
  if (!resp) {
    ticket = survey.anonymity === "ANON" ? randomBytes(16).toString("hex") : undefined;
    [resp] = await db.insert(surveyResponses).values({ surveyId: survey.id, respondentId: survey.anonymity === "ANON" ? null : user.id, pseudonymRef: ticket ?? null, createdDay: today(), page: opts.page ?? 0 }).returning();
  }
  const valid = new Set((await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, survey.id))).map((q) => q.id));
  for (const a of opts.answers) {
    if (!valid.has(a.questionId)) continue;
    await db.insert(surveyAnswers).values({ responseId: resp.id, questionId: a.questionId, value: a.value }).onConflictDoUpdate({ target: [surveyAnswers.responseId, surveyAnswers.questionId], set: { value: a.value } });
  }
  if (opts.page !== undefined) await db.update(surveyResponses).set({ page: opts.page }).where(eq(surveyResponses.id, resp.id));
  return { ticket };
}

// Finalize a response — required questions must be answered.
export async function submitResponse(survey: Survey, user: CurrentUser, ticket?: string): Promise<{ error: string; questionId?: string } | { ok: true }> {
  const resp = await findResponse(survey, user, ticket);
  if (!resp) return { error: "no_response" };
  if (resp.status === "SUBMITTED") return { ok: true };
  const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, survey.id));
  const answers = await db.select({ questionId: surveyAnswers.questionId, value: surveyAnswers.value }).from(surveyAnswers).where(eq(surveyAnswers.responseId, resp.id));
  const byQ = new Map(answers.map((a) => [a.questionId, a.value]));
  for (const q of qs) if (q.required && !isAnswered(q.type, byQ.get(q.id) ?? null)) return { error: "required_missing", questionId: q.id };
  await db.update(surveyResponses).set({ status: "SUBMITTED", submittedDay: today() }).where(eq(surveyResponses.id, resp.id));
  return { ok: true };
}

// Payload for the in-session SURVEY activity: the form + my status (named) + a live count.
export async function buildSurveyActivityPayload(surveyId: string, meId: string) {
  const [sv] = await db.select().from(surveys).where(eq(surveys.id, surveyId));
  if (!sv) return null;
  const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, sv.id)).orderBy(asc(surveyQuestions.position));
  const submitted = await db.select({ id: surveyResponses.id }).from(surveyResponses).where(and(eq(surveyResponses.surveyId, sv.id), eq(surveyResponses.status, "SUBMITTED")));
  let myStatus: string | null = null;
  if (sv.anonymity !== "ANON") {
    const [r] = await db.select({ status: surveyResponses.status }).from(surveyResponses).where(and(eq(surveyResponses.surveyId, sv.id), eq(surveyResponses.respondentId, meId)));
    myStatus = r?.status ?? null;
  }
  return {
    id: sv.id,
    title: sv.title,
    anonymity: sv.anonymity,
    submittedCount: submitted.length,
    myStatus, // null for anonymous (the client tracks its own ticket)
    questions: qs.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options ?? [], required: q.required, allowOther: q.allowOther })),
  };
}

export function surveyRespondRoutes(app: FastifyInstance) {
  // Open or resume: the taker's view (only takers-visible section headings) + any saved progress.
  app.get<{ Params: { id: string }; Querystring: { ticket?: string } }>("/api/surveys/:id/respond", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const s = await openAssigned(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const secs = await db.select().from(surveySections).where(eq(surveySections.surveyId, s.id)).orderBy(asc(surveySections.position));
    const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(asc(surveyQuestions.position));
    const resp = await findResponse(s, me, req.query.ticket);
    const answers = resp ? await db.select({ questionId: surveyAnswers.questionId, value: surveyAnswers.value }).from(surveyAnswers).where(eq(surveyAnswers.responseId, resp.id)) : [];
    return {
      survey: { id: s.id, title: s.title, description: s.description, anonymity: s.anonymity, perPage: s.perPage },
      sectionTitles: Object.fromEntries(secs.filter((x) => x.showToTakers).map((x) => [x.id, x.title])), // hidden sections show no heading
      questions: qs.map((q) => ({ id: q.id, sectionId: q.sectionId, type: q.type, prompt: q.prompt, options: q.options ?? [], required: q.required, allowOther: q.allowOther })),
      response: resp ? { status: resp.status, page: resp.page, answers } : null,
    };
  });

  // Save a page of answers (partial, resumable). Returns the claim ticket for anon responses.
  app.post<{ Params: { id: string } }>("/api/surveys/:id/respond/save", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ ticket: z.string().optional(), page: z.number().int().min(0).optional(), answers: z.array(z.object({ questionId: z.string().uuid(), value: answerValue })).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await openAssigned(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });

    const r = await saveAnswers(s, me, body.data);
    if ("error" in r) return reply.code(409).send(r);
    return { ok: true, ticket: r.ticket };
  });

  // Finalize: required questions must be answered.
  app.post<{ Params: { id: string } }>("/api/surveys/:id/respond/submit", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ ticket: z.string().optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await openAssigned(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const r = await submitResponse(s, me, body.data.ticket);
    if ("error" in r) return reply.code(r.error === "no_response" ? 404 : 400).send(r);
    return { ok: true };
  });
}
