import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { surveys, surveyQuestions, surveySections, surveyCollaborators, surveyEdits, orgNodes, groups, users } from "../../db/schema.js";
import { requireAuth, type CurrentUser } from "../../auth.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";
import { can, hasScope, isGoverned } from "../../lib/capabilities.js";

// Can this user distribute a survey at its chosen scope? Ungoverned users (no permission
// group) keep the open default; governed users need survey.distribute with enough reach.
// Org-wide needs ORG-level reach; a node needs reach to that node; a group just needs the cap.
async function canDistribute(user: CurrentUser, survey: { scopeKind: string | null; scopeId: string | null }): Promise<boolean> {
  if (!(await isGoverned(user.id))) return true;
  if (survey.scopeKind === "ALL") return hasScope(user, "survey.distribute", "ORG");
  if (survey.scopeKind === "GROUP") return can(user, "survey.distribute");
  return can(user, "survey.distribute", survey.scopeId ?? undefined); // NODE
}

const QTYPE = ["SINGLE", "MULTI", "TEXT", "SCALE"] as const;
const scopeRef = z.object({ kind: z.enum(["NODE", "GROUP"]), id: z.string().uuid() });
const surveyBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  anonymity: z.enum(["NAMED", "ANON"]).optional(),
  perPage: z.number().int().min(1).max(50).optional(),
  scopeKind: z.enum(["ALL", "NODE", "GROUP"]).nullish(),
  scopeId: z.string().uuid().nullish(),
  exclusions: z.array(scopeRef).max(50).nullish(),
});

// Is this user in the survey's audience? In the include-scope, and not in any exclusion.
export async function isAssigned(s: { tenantId: string; scopeKind: string | null; scopeId: string | null; exclusions: { kind: string; id: string }[] | null }, userId: string) {
  if (!s.scopeKind) return false;
  if (!(await canSeeScoped({ tenantId: s.tenantId, scopeKind: s.scopeKind, scopeId: s.scopeId }, userId, s.tenantId))) return false;
  for (const ex of s.exclusions ?? []) {
    if (await canSeeScoped({ tenantId: s.tenantId, scopeKind: ex.kind, scopeId: ex.id }, userId, s.tenantId)) return false;
  }
  return true;
}
const questionBody = z.object({
  type: z.enum(QTYPE),
  prompt: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).max(20).optional(),
  required: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  sectionId: z.string().uuid().nullish(),
});

// Owner level (creator or tenant admin) — manages launch, delete, and who can edit.
export async function ownSurvey(id: string, user: CurrentUser) {
  const [s] = await db.select().from(surveys).where(and(eq(surveys.id, id), eq(surveys.tenantId, user.tenantId)));
  if (!s || (s.createdBy !== user.id && user.role !== "TENANT_ADMIN")) return null;
  return s;
}

// Editor level (owner OR a collaborator) — builds the form (questions, sections, settings).
export async function editSurvey(id: string, user: CurrentUser) {
  const [s] = await db.select().from(surveys).where(and(eq(surveys.id, id), eq(surveys.tenantId, user.tenantId)));
  if (!s) return null;
  if (s.createdBy === user.id || user.role === "TENANT_ADMIN") return s;
  const [c] = await db.select().from(surveyCollaborators).where(and(eq(surveyCollaborators.surveyId, id), eq(surveyCollaborators.userId, user.id)));
  return c ? s : null;
}

async function logEdit(surveyId: string, actorId: string, action: string, detail?: string) {
  await db.insert(surveyEdits).values({ surveyId, actorId, action, detail: detail ?? null });
}

async function scopeTargetValid(tenantId: string, kind: string, id: string | null): Promise<boolean> {
  if (kind === "ALL") return true;
  if (!id) return false;
  if (kind === "NODE") return !!(await db.select({ id: orgNodes.id }).from(orgNodes).where(and(eq(orgNodes.id, id), eq(orgNodes.tenantId, tenantId))))[0];
  if (kind === "GROUP") return !!(await db.select({ id: groups.id }).from(groups).where(and(eq(groups.id, id), eq(groups.tenantId, tenantId))))[0];
  return false;
}

export function surveyRoutes(app: FastifyInstance) {
  // The "Create" section: surveys I manage, with question + status info.
  app.get("/api/surveys", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    let where = eq(surveys.tenantId, me.tenantId);
    if (me.role !== "TENANT_ADMIN") {
      // Surveys I created OR collaborate on.
      const collabIds = (await db.select({ id: surveyCollaborators.surveyId }).from(surveyCollaborators).where(eq(surveyCollaborators.userId, me.id))).map((r) => r.id);
      const mineCond = collabIds.length ? or(eq(surveys.createdBy, me.id), inArray(surveys.id, collabIds)) : eq(surveys.createdBy, me.id);
      where = and(eq(surveys.tenantId, me.tenantId), mineCond)!;
    }
    const rows = await db.select().from(surveys).where(where).orderBy(desc(surveys.createdAt));
    const out = await Promise.all(
      rows.map(async (s) => {
        const qs = await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id));
        return { id: s.id, title: s.title, status: s.status, anonymity: s.anonymity, questions: qs.length };
      }),
    );
    return { surveys: out };
  });

  app.post("/api/surveys", { preHandler: requireAuth }, async (req, reply) => {
    const body = surveyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    if ((await isGoverned(me.id)) && !(await can(me, "survey.create"))) return reply.code(403).send({ error: "not_allowed" });
    const [s] = await db.insert(surveys).values({ tenantId: me.tenantId, title: body.data.title, description: body.data.description ?? null, anonymity: body.data.anonymity ?? "NAMED", perPage: body.data.perPage ?? 5, createdBy: me.id }).returning();
    return { survey: { id: s.id } };
  });

  // Full survey + ordered questions (for the builder).
  app.get<{ Params: { id: string } }>("/api/surveys/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(asc(surveyQuestions.position));
    const sections = await db.select().from(surveySections).where(eq(surveySections.surveyId, s.id)).orderBy(asc(surveySections.position));
    const collabRows = await db.select({ id: surveyCollaborators.userId, name: users.displayName }).from(surveyCollaborators).innerJoin(users, eq(users.id, surveyCollaborators.userId)).where(eq(surveyCollaborators.surveyId, s.id));
    return {
      survey: { id: s.id, title: s.title, description: s.description, anonymity: s.anonymity, perPage: s.perPage, status: s.status, scopeKind: s.scopeKind, scopeId: s.scopeId, exclusions: s.exclusions ?? [], scopeLabel: s.scopeKind ? await scopeLabel(s.tenantId, s.scopeKind, s.scopeId) : null, isOwner: s.createdBy === me.id || me.role === "TENANT_ADMIN" },
      sections: sections.map((sec) => ({ id: sec.id, title: sec.title, showToTakers: sec.showToTakers })),
      questions: qs.map((q) => ({ id: q.id, sectionId: q.sectionId, type: q.type, prompt: q.prompt, options: q.options ?? [], required: q.required, allowOther: q.allowOther })),
      collaborators: collabRows,
    };
  });

  app.patch<{ Params: { id: string } }>("/api/surveys/:id", { preHandler: requireAuth }, async (req, reply) => {
    const body = surveyBody.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const s = await editSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" }); // structure locked once launched
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "description", "anonymity", "perPage", "scopeKind", "scopeId", "exclusions"] as const) if (body.data[k] !== undefined) patch[k] = body.data[k];
    if (Object.keys(patch).length) await db.update(surveys).set(patch).where(eq(surveys.id, s.id));
    return { ok: true };
  });

  // Copy a survey (+ its questions) into a fresh DRAFT I own.
  app.post<{ Params: { id: string } }>("/api/surveys/:id/copy", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const [copy] = await db.insert(surveys).values({ tenantId: me.tenantId, title: `${s.title} (copy)`, description: s.description, anonymity: s.anonymity, perPage: s.perPage, createdBy: me.id }).returning();
    // Copy sections (remapping ids), then questions into their new sections.
    const secs = await db.select().from(surveySections).where(eq(surveySections.surveyId, s.id)).orderBy(asc(surveySections.position));
    const secMap = new Map<string, string>();
    for (const sec of secs) {
      const [ns] = await db.insert(surveySections).values({ surveyId: copy.id, position: sec.position, title: sec.title, showToTakers: sec.showToTakers }).returning();
      secMap.set(sec.id, ns.id);
    }
    const qs = await db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(asc(surveyQuestions.position));
    if (qs.length) await db.insert(surveyQuestions).values(qs.map((q) => ({ surveyId: copy.id, sectionId: q.sectionId ? secMap.get(q.sectionId) ?? null : null, position: q.position, type: q.type, prompt: q.prompt, options: q.options, required: q.required, allowOther: q.allowOther })));
    return { survey: { id: copy.id } };
  });

  app.delete<{ Params: { id: string } }>("/api/surveys/:id", { preHandler: requireAuth }, async (req, reply) => {
    const s = await ownSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    await db.delete(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id));
    await db.delete(surveys).where(eq(surveys.id, s.id));
    return { ok: true };
  });

  // Launch: DRAFT → OPEN. Needs a scope and at least one question.
  app.post<{ Params: { id: string } }>("/api/surveys/:id/launch", { preHandler: requireAuth }, async (req, reply) => {
    const s = await ownSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    if (!s.scopeKind) return reply.code(400).send({ error: "no_scope" });
    if (!(await canDistribute(req.currentUser!, s))) return reply.code(403).send({ error: "scope_not_allowed" });
    const qn = await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id));
    if (qn.length === 0) return reply.code(400).send({ error: "no_questions" });
    if (!(await scopeTargetValid(s.tenantId, s.scopeKind, s.scopeId))) return reply.code(400).send({ error: "invalid_scope" });
    for (const ex of s.exclusions ?? []) if (!(await scopeTargetValid(s.tenantId, ex.kind, ex.id))) return reply.code(400).send({ error: "invalid_scope" });
    await db.update(surveys).set({ status: "OPEN" }).where(eq(surveys.id, s.id));
    return { ok: true };
  });

  // Lifecycle transitions (creator/admin): pause, resume, close.
  for (const [verb, from, to] of [["pause", "OPEN", "PAUSED"], ["resume", "PAUSED", "OPEN"], ["close", "OPEN,PAUSED", "CLOSED"]] as const) {
    app.post<{ Params: { id: string } }>(`/api/surveys/:id/${verb}`, { preHandler: requireAuth }, async (req, reply) => {
      const s = await ownSurvey(req.params.id, req.currentUser!);
      if (!s) return reply.code(404).send({ error: "not_found" });
      if (!from.split(",").includes(s.status)) return reply.code(409).send({ error: "bad_state" });
      await db.update(surveys).set({ status: to }).where(eq(surveys.id, s.id));
      return { ok: true };
    });
  }

  // The "To complete" section: OPEN surveys I'm in the audience for.
  app.get("/api/surveys/assigned", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const open = await db.select().from(surveys).where(and(eq(surveys.tenantId, me.tenantId), eq(surveys.status, "OPEN")));
    const out = [];
    for (const s of open) {
      if (!(await isAssigned(s, me.id))) continue;
      const qs = await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id));
      out.push({ id: s.id, title: s.title, anonymity: s.anonymity, questions: qs.length });
    }
    return { surveys: out };
  });

  // --- Questions (DRAFT only) ---
  app.post<{ Params: { id: string } }>("/api/surveys/:id/questions", { preHandler: requireAuth }, async (req, reply) => {
    const body = questionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    const [last] = await db.select({ position: surveyQuestions.position }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(desc(surveyQuestions.position)).limit(1);
    const choice = body.data.type === "SINGLE" || body.data.type === "MULTI";
    await db.insert(surveyQuestions).values({
      surveyId: s.id,
      sectionId: body.data.sectionId ?? null,
      position: (last?.position ?? 0) + 1,
      type: body.data.type,
      prompt: body.data.prompt,
      options: choice ? body.data.options ?? [] : null,
      required: body.data.required ?? false,
      allowOther: choice ? body.data.allowOther ?? false : false,
    });
    await logEdit(s.id, me.id, "added a question", body.data.prompt);
    return { ok: true };
  });

  app.patch<{ Params: { id: string; qid: string } }>("/api/surveys/:id/questions/:qid", { preHandler: requireAuth }, async (req, reply) => {
    const body = questionBody.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    const patch: Record<string, unknown> = {};
    for (const k of ["type", "prompt", "options", "required", "allowOther", "sectionId"] as const) if (body.data[k] !== undefined) patch[k] = body.data[k];
    if (Object.keys(patch).length) {
      await db.update(surveyQuestions).set(patch).where(and(eq(surveyQuestions.id, req.params.qid), eq(surveyQuestions.surveyId, s.id)));
      await logEdit(s.id, me.id, "edited a question", typeof patch.prompt === "string" ? patch.prompt : undefined);
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string; qid: string } }>("/api/surveys/:id/questions/:qid", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    const [q] = await db.select({ prompt: surveyQuestions.prompt }).from(surveyQuestions).where(and(eq(surveyQuestions.id, req.params.qid), eq(surveyQuestions.surveyId, s.id)));
    await db.delete(surveyQuestions).where(and(eq(surveyQuestions.id, req.params.qid), eq(surveyQuestions.surveyId, s.id)));
    if (q) await logEdit(s.id, me.id, "removed a question", q.prompt);
    return { ok: true };
  });

  // Reorder by swapping position with the neighbour above/below.
  app.post<{ Params: { id: string; qid: string } }>("/api/surveys/:id/questions/:qid/move", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ dir: z.enum(["up", "down"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const s = await editSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    const [q] = await db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, req.params.qid), eq(surveyQuestions.surveyId, s.id)));
    if (!q) return reply.code(404).send({ error: "not_found" });
    const cmp = body.data.dir === "up" ? lt(surveyQuestions.position, q.position) : gt(surveyQuestions.position, q.position);
    const [neighbor] = await db.select().from(surveyQuestions).where(and(eq(surveyQuestions.surveyId, s.id), cmp)).orderBy(body.data.dir === "up" ? desc(surveyQuestions.position) : asc(surveyQuestions.position)).limit(1);
    if (neighbor) {
      await db.update(surveyQuestions).set({ position: neighbor.position }).where(eq(surveyQuestions.id, q.id));
      await db.update(surveyQuestions).set({ position: q.position }).where(eq(surveyQuestions.id, neighbor.id));
    }
    return { ok: true };
  });

  // --- Sections (DRAFT only; organize questions, optionally shown to takers) ---
  app.post<{ Params: { id: string } }>("/api/surveys/:id/sections", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), showToTakers: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    const [last] = await db.select({ position: surveySections.position }).from(surveySections).where(eq(surveySections.surveyId, s.id)).orderBy(desc(surveySections.position)).limit(1);
    await db.insert(surveySections).values({ surveyId: s.id, position: (last?.position ?? 0) + 1, title: body.data.title, showToTakers: body.data.showToTakers ?? true });
    await logEdit(s.id, me.id, "added a section", body.data.title);
    return { ok: true };
  });

  app.patch<{ Params: { id: string; sid: string } }>("/api/surveys/:id/sections/:sid", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200).optional(), showToTakers: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const s = await editSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "showToTakers"] as const) if (body.data[k] !== undefined) patch[k] = body.data[k];
    if (Object.keys(patch).length) await db.update(surveySections).set(patch).where(and(eq(surveySections.id, req.params.sid), eq(surveySections.surveyId, s.id)));
    return { ok: true };
  });

  app.delete<{ Params: { id: string; sid: string } }>("/api/surveys/:id/sections/:sid", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const s = await editSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    if (s.status !== "DRAFT") return reply.code(409).send({ error: "not_draft" });
    await db.update(surveyQuestions).set({ sectionId: null }).where(and(eq(surveyQuestions.sectionId, req.params.sid), eq(surveyQuestions.surveyId, s.id))); // questions become ungrouped
    await db.delete(surveySections).where(and(eq(surveySections.id, req.params.sid), eq(surveySections.surveyId, s.id)));
    await logEdit(s.id, me.id, "removed a section");
    return { ok: true };
  });

  // --- Collaborators (owner manages who can build) ---
  app.post<{ Params: { id: string } }>("/api/surveys/:id/collaborators", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await ownSurvey(req.params.id, me);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const [u] = await db.select({ id: users.id, name: users.displayName }).from(users).where(and(eq(users.email, body.data.email.toLowerCase()), eq(users.tenantId, me.tenantId)));
    if (!u) return reply.code(404).send({ error: "no_such_user" });
    if (u.id === s.createdBy) return reply.code(409).send({ error: "already_owner" });
    await db.insert(surveyCollaborators).values({ surveyId: s.id, userId: u.id }).onConflictDoNothing();
    await logEdit(s.id, me.id, "added an editor", u.name);
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>("/api/surveys/:id/collaborators/:userId", { preHandler: requireAuth }, async (req, reply) => {
    const s = await ownSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    await db.delete(surveyCollaborators).where(and(eq(surveyCollaborators.surveyId, s.id), eq(surveyCollaborators.userId, req.params.userId)));
    return { ok: true };
  });

  // Revision history.
  app.get<{ Params: { id: string } }>("/api/surveys/:id/edits", { preHandler: requireAuth }, async (req, reply) => {
    const s = await editSurvey(req.params.id, req.currentUser!);
    if (!s) return reply.code(404).send({ error: "not_found" });
    const rows = await db.select({ id: surveyEdits.id, action: surveyEdits.action, detail: surveyEdits.detail, actorName: users.displayName, createdAt: surveyEdits.createdAt }).from(surveyEdits).innerJoin(users, eq(users.id, surveyEdits.actorId)).where(eq(surveyEdits.surveyId, s.id)).orderBy(desc(surveyEdits.id)).limit(40);
    return { edits: rows.map((e) => ({ id: e.id, action: e.action, detail: e.detail, actorName: e.actorName, createdAt: e.createdAt.toISOString() })) };
  });
}
