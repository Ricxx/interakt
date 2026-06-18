import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { quizzes, quizQuestions } from "../../db/schema.js";
import { requireAuth, type CurrentUser } from "../../auth.js";

const QTYPE = ["MC", "TF", "TYPE_ANSWER", "PUZZLE", "SLIDER"] as const;
const correctShape = z.object({
  indices: z.array(z.number().int()).optional(),
  bool: z.boolean().optional(),
  texts: z.array(z.string().min(1).max(200)).optional(),
  order: z.array(z.number().int()).optional(),
  value: z.number().optional(),
  tolerance: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
const questionBody = z.object({
  type: z.enum(QTYPE),
  prompt: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).max(8).optional(),
  correct: correctShape.optional(),
  timeLimitSec: z.number().int().min(5).max(300).optional(),
  points: z.enum(["STANDARD", "DOUBLE", "NONE"]).optional(),
  mediaKind: z.enum(["IMAGE", "VIDEO", "AUDIO"]).nullish(),
  mediaUrl: z.string().url().max(2000).nullish(),
});

// A quiz the caller may manage (creator or admin).
async function ownQuiz(id: string, user: CurrentUser) {
  const [q] = await db.select().from(quizzes).where(and(eq(quizzes.id, id), eq(quizzes.tenantId, user.tenantId)));
  if (!q || (q.createdBy !== user.id && user.role !== "TENANT_ADMIN")) return null;
  return q;
}

// Defaults for a freshly-added question of each type (so the builder starts editable).
function seedFor(type: string): { options: string[] | null; correct: Record<string, unknown> } {
  if (type === "MC") return { options: ["Option 1", "Option 2", "Option 3", "Option 4"], correct: { indices: [0] } };
  if (type === "TF") return { options: null, correct: { bool: true } };
  if (type === "TYPE_ANSWER") return { options: null, correct: { texts: ["answer"] } };
  if (type === "PUZZLE") return { options: ["First", "Second", "Third"], correct: { order: [0, 1, 2] } };
  return { options: null, correct: { min: 0, max: 100, value: 50, tolerance: 0 } }; // SLIDER
}

export function quizRoutes(app: FastifyInstance) {
  app.get("/api/quizzes", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const where = me.role === "TENANT_ADMIN" ? eq(quizzes.tenantId, me.tenantId) : and(eq(quizzes.tenantId, me.tenantId), eq(quizzes.createdBy, me.id));
    const rows = await db.select().from(quizzes).where(where).orderBy(desc(quizzes.createdAt));
    const out = await Promise.all(rows.map(async (q) => ({ id: q.id, title: q.title, questions: (await db.select({ id: quizQuestions.id }).from(quizQuestions).where(eq(quizQuestions.quizId, q.id))).length })));
    return { quizzes: out };
  });

  app.post("/api/quizzes", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [q] = await db.insert(quizzes).values({ tenantId: me.tenantId, title: body.data.title, description: body.data.description ?? null, createdBy: me.id }).returning();
    return { quiz: { id: q.id } };
  });

  app.get<{ Params: { id: string } }>("/api/quizzes/:id", { preHandler: requireAuth }, async (req, reply) => {
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, q.id)).orderBy(asc(quizQuestions.position));
    return {
      quiz: { id: q.id, title: q.title, description: q.description },
      questions: qs.map((x) => ({ id: x.id, type: x.type, prompt: x.prompt, options: x.options ?? [], correct: x.correct ?? {}, timeLimitSec: x.timeLimitSec, points: x.points, mediaKind: x.mediaKind, mediaUrl: x.mediaUrl })),
    };
  });

  app.patch<{ Params: { id: string } }>("/api/quizzes/:id", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(2000).nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "description"] as const) if (body.data[k] !== undefined) patch[k] = body.data[k];
    if (Object.keys(patch).length) await db.update(quizzes).set(patch).where(eq(quizzes.id, q.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/quizzes/:id/copy", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const q = await ownQuiz(req.params.id, me);
    if (!q) return reply.code(404).send({ error: "not_found" });
    const [copy] = await db.insert(quizzes).values({ tenantId: me.tenantId, title: `${q.title} (copy)`, description: q.description, createdBy: me.id }).returning();
    const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, q.id)).orderBy(asc(quizQuestions.position));
    if (qs.length) await db.insert(quizQuestions).values(qs.map((x) => ({ quizId: copy.id, position: x.position, type: x.type, prompt: x.prompt, options: x.options, correct: x.correct, timeLimitSec: x.timeLimitSec, points: x.points, mediaKind: x.mediaKind, mediaUrl: x.mediaUrl })));
    return { quiz: { id: copy.id } };
  });

  app.delete<{ Params: { id: string } }>("/api/quizzes/:id", { preHandler: requireAuth }, async (req, reply) => {
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    await db.delete(quizQuestions).where(eq(quizQuestions.quizId, q.id));
    await db.delete(quizzes).where(eq(quizzes.id, q.id));
    return { ok: true };
  });

  // --- Questions ---
  app.post<{ Params: { id: string } }>("/api/quizzes/:id/questions", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ type: z.enum(QTYPE) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    const [last] = await db.select({ position: quizQuestions.position }).from(quizQuestions).where(eq(quizQuestions.quizId, q.id)).orderBy(desc(quizQuestions.position)).limit(1);
    const s = seedFor(body.data.type);
    await db.insert(quizQuestions).values({ quizId: q.id, position: (last?.position ?? 0) + 1, type: body.data.type, prompt: "New question", options: s.options, correct: s.correct, timeLimitSec: 20, points: "STANDARD" });
    return { ok: true };
  });

  app.patch<{ Params: { id: string; qid: string } }>("/api/quizzes/:id/questions/:qid", { preHandler: requireAuth }, async (req, reply) => {
    const body = questionBody.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    const patch: Record<string, unknown> = {};
    for (const k of ["type", "prompt", "options", "correct", "timeLimitSec", "points", "mediaKind", "mediaUrl"] as const) if (body.data[k] !== undefined) patch[k] = body.data[k];
    if (Object.keys(patch).length) await db.update(quizQuestions).set(patch).where(and(eq(quizQuestions.id, req.params.qid), eq(quizQuestions.quizId, q.id)));
    return { ok: true };
  });

  app.delete<{ Params: { id: string; qid: string } }>("/api/quizzes/:id/questions/:qid", { preHandler: requireAuth }, async (req, reply) => {
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    await db.delete(quizQuestions).where(and(eq(quizQuestions.id, req.params.qid), eq(quizQuestions.quizId, q.id)));
    return { ok: true };
  });

  app.post<{ Params: { id: string; qid: string } }>("/api/quizzes/:id/questions/:qid/move", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ dir: z.enum(["up", "down"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const q = await ownQuiz(req.params.id, req.currentUser!);
    if (!q) return reply.code(404).send({ error: "not_found" });
    const [item] = await db.select().from(quizQuestions).where(and(eq(quizQuestions.id, req.params.qid), eq(quizQuestions.quizId, q.id)));
    if (!item) return reply.code(404).send({ error: "not_found" });
    const cmp = body.data.dir === "up" ? lt(quizQuestions.position, item.position) : gt(quizQuestions.position, item.position);
    const [n] = await db.select().from(quizQuestions).where(and(eq(quizQuestions.quizId, q.id), cmp)).orderBy(body.data.dir === "up" ? desc(quizQuestions.position) : asc(quizQuestions.position)).limit(1);
    if (n) {
      await db.update(quizQuestions).set({ position: n.position }).where(eq(quizQuestions.id, item.id));
      await db.update(quizQuestions).set({ position: item.position }).where(eq(quizQuestions.id, n.id));
    }
    return { ok: true };
  });
}
