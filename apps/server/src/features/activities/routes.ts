import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { activities, activityPicks, activityVotes, brainstormComments, brainstormIdeas, brainstormLikes, pollVotes, rpsRounds, sessions, sessionParticipants, sessionTasks, straws, surveys, surveyQuestions, surveyResponses, teamAssignments, triviaSubmissions, users, wordcloudEntries } from "../../db/schema.js";
import { saveAnswers, submitResponse, findResponse } from "../surveys/respond.js";
import { quizzes, quizQuestions, quizAnswers } from "../../db/schema.js";
import { gradeAndStore } from "../quizzes/game.js";
import { requireAuth } from "../../auth.js";
import { hub } from "../../lib/realtime.js";
import { canRunActivities, isInRoom } from "../../lib/sessionControl.js";
import { recordTaskEvent } from "../tasks/events.js";
import { pollCsv } from "../poll/payload.js";
import { recordAudit } from "../../lib/audit.js";

const startBody = z.object({
  type: z.enum(["RANDOMIZER", "NOMINATION", "BRAINSTORM", "RPS", "TASKS", "TASK_REVIEW", "TRIVIA", "POLL", "WORDCLOUD", "DRAW_STRAWS", "TEAM_SELECT", "SURVEY", "QUIZ"]),
  title: z.string().min(1).max(120),
  draft: z.boolean().optional(), // pre-plan without launching
  agendaItemId: z.string().uuid().optional(), // tie a draft to an agenda item
  config: z
    .object({
      removeAfterPick: z.boolean().optional(),
      includeHost: z.boolean().optional(),
      anonymous: z.boolean().optional(),
      showCounts: z.boolean().optional(),
      timerSeconds: z.number().int().min(5).max(600).optional(),
      description: z.string().max(2000).optional(),
      bestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)]).optional(),
      agreementKind: z.enum(["LOSER", "WINNER"]).optional(),
      agreementText: z.string().max(200).optional(),
      player1Id: z.string().uuid().optional(),
      player2Id: z.string().uuid().optional(),
      pollOptions: z.array(z.string().min(1).max(120)).min(2).max(10).optional(),
      anonymity: z.enum(["NAMED", "ANON_ROOM", "ANON_ALL"]).optional(),
      resultsVisibility: z.enum(["LIVE", "AFTER_VOTE", "HIDDEN"]).optional(),
      chartType: z.enum(["BAR", "DONUT"]).optional(),
      closeSeconds: z.number().int().min(10).max(3600).optional(),
      maxPerPerson: z.number().int().min(1).max(10).optional(),
      teamCount: z.number().int().min(2).max(6).optional(),
      surveyId: z.string().uuid().optional(),
      quizId: z.string().uuid().optional(),
    })
    .optional(),
});

// votingEndsAt for a nomination with a timer (computed from createdAt).
function votingEndsAt(activity: { createdAt: Date; config: { timerSeconds?: number } | null }): number | null {
  const s = activity.config?.timerSeconds;
  return s ? activity.createdAt.getTime() + s * 1000 : null;
}

export function activityRoutes(app: FastifyInstance) {
  // Host: start an activity in their session (ends any currently-live one first).
  app.post<{ Params: { id: string } }>("/api/sessions/:id/activities", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = startBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!.id;
    const [session] = await db.select().from(sessions).where(eq(sessions.id, req.params.id));
    if (!session) return reply.code(403).send({ error: "not_host_or_ended" });
    const c = parsed.data.config ?? {};

    // Draft: pre-plan (config stored raw; deadlines/validation happen at launch). Controllers only.
    if (parsed.data.draft) {
      if (session.state !== "LIVE" && session.state !== "SCHEDULED") return reply.code(403).send({ error: "not_host_or_ended" });
      if (!(await canRunActivities(session.id, me))) return reply.code(403).send({ error: "not_allowed" });
      await db.insert(activities).values({ sessionId: session.id, type: parsed.data.type, title: parsed.data.title, startedBy: me, config: c, agendaItemId: parsed.data.agendaItemId ?? null, state: "DRAFT" });
      await notify(session.id);
      return { ok: true };
    }

    if (session.state !== "LIVE") return reply.code(403).send({ error: "not_host_or_ended" });
    // Host/co-host/activity-admin can always start. Participants only if the host enabled it for this type.
    if (!(await canRunActivities(session.id, me))) {
      const enabled = session.settings?.participantStart ?? true;
      const allowed = session.settings?.participantTypes ?? ["RPS"];
      if (!enabled || !allowed.includes(parsed.data.type)) return reply.code(403).send({ error: "not_allowed" });
      if (!(await isInRoom(session.id, me))) return reply.code(403).send({ error: "not_in_room" });
    }

    const built = await buildActivityConfig(parsed.data.type, c, session);
    if ("error" in built) return reply.code(400).send({ error: built.error });

    await db.update(activities).set({ state: "ENDED", endedAt: new Date() }).where(and(eq(activities.sessionId, session.id), eq(activities.state, "LIVE")));
    const [activity] = await db
      .insert(activities)
      .values({ sessionId: session.id, type: parsed.data.type, title: parsed.data.title, startedBy: me, config: built.config, agendaItemId: session.activeAgendaId ?? null })
      .returning();
    if (parsed.data.type === "RPS") await db.insert(rpsRounds).values({ activityId: activity.id, roundNo: 1, deadlineAt: rpsDeadline() });
    if (parsed.data.type === "DRAW_STRAWS") await seedStraws(activity.id, session);
    if (parsed.data.type === "TEAM_SELECT") await seedTeams(activity.id, session, (built.config.teamCount as number) ?? 2);
    if (parsed.data.type === "SURVEY") await openSurveyForActivity(built.config.surveyId as string);
    await notify(session.id);
    return { activity: { id: activity.id } };
  });

  // Launch a pre-planned draft: compute fresh config + deadlines now, end any live one, go live.
  app.post<{ Params: { id: string } }>("/api/activities/:id/launch", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "DRAFT") return reply.code(404).send({ error: "not_found" });
    const [session] = await db.select().from(sessions).where(eq(sessions.id, activity.sessionId));
    if (!session || session.state !== "LIVE") return reply.code(409).send({ error: "session_not_live" });
    if (!(await canRunActivities(session.id, me))) return reply.code(403).send({ error: "not_allowed" });

    const built = await buildActivityConfig(activity.type, (activity.config ?? {}) as ActivityInput, session);
    if ("error" in built) return reply.code(400).send({ error: built.error });

    await db.update(activities).set({ state: "ENDED", endedAt: new Date() }).where(and(eq(activities.sessionId, session.id), eq(activities.state, "LIVE")));
    const agendaItemId = activity.agendaItemId ?? session.activeAgendaId ?? null;
    await db.update(activities).set({ state: "LIVE", config: built.config, startedBy: me, agendaItemId, createdAt: new Date() }).where(eq(activities.id, activity.id));
    if (activity.type === "RPS") await db.insert(rpsRounds).values({ activityId: activity.id, roundNo: 1, deadlineAt: rpsDeadline() });
    if (activity.type === "DRAW_STRAWS") await seedStraws(activity.id, session);
    if (activity.type === "TEAM_SELECT") await seedTeams(activity.id, session, (built.config.teamCount as number) ?? 2);
    if (activity.type === "SURVEY") await openSurveyForActivity(built.config.surveyId as string);
    if (activity.agendaItemId) await db.update(sessions).set({ activeAgendaId: activity.agendaItemId }).where(eq(sessions.id, session.id));
    await notify(session.id);
    return { ok: true };
  });

  // Edit a draft (controllers only): set its agenda item and/or scheduled launch time.
  app.patch<{ Params: { id: string } }>("/api/activities/:id", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ agendaItemId: z.string().uuid().nullish(), launchAt: z.string().datetime().nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "DRAFT") return reply.code(404).send({ error: "not_found" });
    if (!(await canRunActivities(activity.sessionId, req.currentUser!.id))) return reply.code(403).send({ error: "not_allowed" });
    const patch: Record<string, unknown> = {};
    if (body.data.agendaItemId !== undefined) patch.agendaItemId = body.data.agendaItemId;
    if (body.data.launchAt !== undefined) patch.config = { ...activity.config, launchAt: body.data.launchAt ?? undefined };
    if (Object.keys(patch).length) await db.update(activities).set(patch).where(eq(activities.id, activity.id));
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Discard a draft (controllers only).
  app.delete<{ Params: { id: string } }>("/api/activities/:id", { preHandler: requireAuth }, async (req, reply) => {
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "DRAFT") return reply.code(404).send({ error: "not_found" });
    if (!(await canRunActivities(activity.sessionId, req.currentUser!.id))) return reply.code(403).send({ error: "not_allowed" });
    await db.delete(activities).where(eq(activities.id, activity.id));
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Host: pick from the room. No body -> random; { userId } -> choose that person (manual).
  app.post<{ Params: { id: string } }>("/api/activities/:id/pick", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ userId: z.string().uuid().optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_host_or_ended" });

    const joined = await db
      .select({ userId: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, ctx.session.id), eq(sessionParticipants.state, "JOINED")));
    const joinedSet = new Set(joined.map((j) => j.userId));
    if (ctx.activity.config?.includeHost) joinedSet.add(ctx.session.hostId); // host opted into the draw
    const removeMode = ctx.activity.config?.removeAfterPick !== false;
    const picked = await db.select({ userId: activityPicks.userId }).from(activityPicks).where(eq(activityPicks.activityId, ctx.activity.id));
    const pickedSet = new Set(picked.map((p) => p.userId));

    let choice: string;
    let manual = false;
    if (body.data.userId) {
      if (!joinedSet.has(body.data.userId)) return reply.code(409).send({ error: "not_in_room" });
      if (removeMode && pickedSet.has(body.data.userId)) return reply.code(409).send({ error: "already_picked" });
      choice = body.data.userId;
      manual = true;
    } else {
      let pool = [...joinedSet];
      if (removeMode) pool = pool.filter((u) => !pickedSet.has(u));
      if (pool.length === 0) return reply.code(409).send({ error: "no_eligible" });
      choice = pool[randomInt(pool.length)];
    }

    await db.insert(activityPicks).values({ activityId: ctx.activity.id, userId: choice, manual });
    await notify(ctx.session.id);
    return { pickedUserId: choice, manual };
  });

  // Participant: vote for who goes next (one vote each; changeable until winner set).
  app.post<{ Params: { id: string } }>("/api/activities/:id/vote", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ nomineeId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "NOMINATION") return reply.code(404).send({ error: "not_found" });
    const ends = votingEndsAt(activity);
    if (ends && Date.now() > ends) return reply.code(409).send({ error: "voting_closed" });

    const joined = async (userId: string) =>
      (await db.select({ u: sessionParticipants.userId }).from(sessionParticipants).where(and(eq(sessionParticipants.sessionId, activity.sessionId), eq(sessionParticipants.userId, userId), eq(sessionParticipants.state, "JOINED")))).length > 0;
    if (!(await joined(me.id))) return reply.code(403).send({ error: "not_in_room" });
    if (!(await joined(body.data.nomineeId))) return reply.code(400).send({ error: "invalid_nominee" });

    await db
      .insert(activityVotes)
      .values({ activityId: activity.id, voterId: me.id, nomineeId: body.data.nomineeId })
      .onConflictDoUpdate({ target: [activityVotes.activityId, activityVotes.voterId], set: { nomineeId: body.data.nomineeId } });
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Host: close voting and set the top nominee as selected (ties broken at random).
  app.post<{ Params: { id: string } }>("/api/activities/:id/select-winner", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_host_or_ended" });
    const votes = await db.select({ nomineeId: activityVotes.nomineeId }).from(activityVotes).where(eq(activityVotes.activityId, ctx.activity.id));
    if (votes.length === 0) return reply.code(409).send({ error: "no_votes" });

    const counts = new Map<string, number>();
    for (const v of votes) counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
    const max = Math.max(...counts.values());
    const top = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
    const winner = top[randomInt(top.length)];

    await db.delete(activityPicks).where(eq(activityPicks.activityId, ctx.activity.id));
    await db.insert(activityPicks).values({ activityId: ctx.activity.id, userId: winner, manual: false });
    await notify(ctx.session.id);
    return { winnerUserId: winner };
  });

  // Host: toggle live options (e.g. reveal/hide results).
  app.patch<{ Params: { id: string } }>("/api/activities/:id/config", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ showCounts: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_host_or_ended" });
    await db.update(activities).set({ config: { ...ctx.activity.config, ...body.data } }).where(eq(activities.id, ctx.activity.id));
    await notify(ctx.session.id);
    return { ok: true };
  });

  // Host: clear all picks (start the draw over).
  app.post<{ Params: { id: string } }>("/api/activities/:id/reset", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_host_or_ended" });
    await db.delete(activityPicks).where(eq(activityPicks.activityId, ctx.activity.id));
    await notify(ctx.session.id);
    return { ok: true };
  });

  // Host: end the activity.
  app.post<{ Params: { id: string } }>("/api/activities/:id/end", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_host_or_ended" });
    await db.update(activities).set({ state: "ENDED", endedAt: new Date() }).where(eq(activities.id, ctx.activity.id));
    await notify(ctx.session.id);
    return { ok: true };
  });

  // Host/co-host: edit a brainstorm's subject + description — only before any idea exists.
  app.patch<{ Params: { id: string } }>("/api/activities/:id/brainstorm", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "BRAINSTORM") return reply.code(403).send({ error: "not_allowed" });
    const [idea] = await db.select({ id: brainstormIdeas.id }).from(brainstormIdeas).where(eq(brainstormIdeas.activityId, ctx.activity.id)).limit(1);
    if (idea) return reply.code(409).send({ error: "has_ideas" });

    const set: { title?: string; config?: typeof ctx.activity.config } = {};
    if (body.data.title !== undefined) set.title = body.data.title;
    if (body.data.description !== undefined) set.config = { ...ctx.activity.config, description: body.data.description };
    await db.update(activities).set(set).where(eq(activities.id, ctx.activity.id));
    await notify(ctx.session.id);
    return { ok: true };
  });

  // --- Brainstorm (anyone in the room contributes) ---

  // Add an idea to the central subject.
  app.post<{ Params: { id: string } }>("/api/activities/:id/ideas", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), body: z.string().max(2000).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_in_room" });
    await db.insert(brainstormIdeas).values({ activityId: ctx.activity.id, userId: req.currentUser!.id, title: body.data.title, body: body.data.body ?? null });
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Toggle a like on an idea.
  app.post<{ Params: { id: string; ideaId: string } }>("/api/activities/:id/ideas/:ideaId/like", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_in_room" });
    const me = req.currentUser!.id;
    const [existing] = await db.select().from(brainstormLikes).where(and(eq(brainstormLikes.ideaId, req.params.ideaId), eq(brainstormLikes.userId, me)));
    if (existing) await db.delete(brainstormLikes).where(and(eq(brainstormLikes.ideaId, req.params.ideaId), eq(brainstormLikes.userId, me)));
    else await db.insert(brainstormLikes).values({ ideaId: req.params.ideaId, userId: me }).onConflictDoNothing();
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Comments on an idea (readable even after the activity ends, for review).
  app.get<{ Params: { id: string; ideaId: string } }>("/api/activities/:id/ideas/:ideaId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const [activity] = await db.select({ sessionId: activities.sessionId }).from(activities).where(eq(activities.id, req.params.id));
    if (!activity || !(await isInRoom(activity.sessionId, req.currentUser!.id))) return reply.code(403).send({ error: "not_in_room" });
    const rows = await db
      .select({ id: brainstormComments.id, name: users.displayName, body: brainstormComments.body, createdAt: brainstormComments.createdAt })
      .from(brainstormComments)
      .innerJoin(users, eq(users.id, brainstormComments.userId))
      .where(eq(brainstormComments.ideaId, req.params.ideaId))
      .orderBy(brainstormComments.createdAt);
    return { comments: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });

  app.post<{ Params: { id: string; ideaId: string } }>("/api/activities/:id/ideas/:ideaId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ body: z.string().min(1).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx) return reply.code(403).send({ error: "not_in_room" });
    await db.insert(brainstormComments).values({ ideaId: req.params.ideaId, userId: req.currentUser!.id, body: body.data.body });
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // RPS: a player locks in their choice for the current round.
  app.post<{ Params: { id: string } }>("/api/activities/:id/rps/pick", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ choice: z.enum(["ROCK", "PAPER", "SCISSORS"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "RPS") return reply.code(404).send({ error: "not_found" });
    const cfg = activity.config ?? {};
    const slot = cfg.player1Id === me ? 1 : cfg.player2Id === me ? 2 : null;
    if (!slot) return reply.code(403).send({ error: "not_a_player" });

    const [round] = await db.select().from(rpsRounds).where(and(eq(rpsRounds.activityId, activity.id), isNull(rpsRounds.winner))).orderBy(desc(rpsRounds.roundNo)).limit(1);
    if (!round) return reply.code(409).send({ error: "match_over" });
    if ((slot === 1 && round.p1Choice) || (slot === 2 && round.p2Choice)) return { ok: true }; // already locked

    await db.update(rpsRounds).set(slot === 1 ? { p1Choice: body.data.choice } : { p2Choice: body.data.choice }).where(eq(rpsRounds.id, round.id));
    const [r] = await db.select().from(rpsRounds).where(eq(rpsRounds.id, round.id));
    if (r.p1Choice && r.p2Choice) await advanceRps(activity, r);
    await notify(activity.sessionId);
    return { ok: true };
  });

  // RPS: a player (or anyone in the room) resolves a round whose lock-in deadline has passed.
  // Whoever didn't lock in forfeits the round; two forfeits loses the match.
  app.post<{ Params: { id: string } }>("/api/activities/:id/rps/timeout", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "RPS") return reply.code(404).send({ error: "not_found" });
    const cfg = activity.config ?? {};
    const isPlayer = cfg.player1Id === me || cfg.player2Id === me;
    if (!isPlayer && !(await isInRoom(activity.sessionId, me))) return reply.code(403).send({ error: "not_in_room" });

    const [round] = await db.select().from(rpsRounds).where(and(eq(rpsRounds.activityId, activity.id), isNull(rpsRounds.winner))).orderBy(desc(rpsRounds.roundNo)).limit(1);
    if (!round) return { ok: true }; // match already over
    if (round.deadlineAt && Date.now() < round.deadlineAt.getTime() - 1500) return reply.code(425).send({ error: "too_early" });
    if (round.p1Choice && round.p2Choice) return { ok: true }; // both locked; the pick path resolves it

    await db.update(rpsRounds).set({ p1Forfeit: !round.p1Choice, p2Forfeit: !round.p2Choice }).where(eq(rpsRounds.id, round.id));
    const [r] = await db.select().from(rpsRounds).where(eq(rpsRounds.id, round.id));
    if (!r.winner) await advanceRps(activity, r);
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Tasks: anyone in the room can jot a task (optionally a subtask) on the board this activity drives.
  app.post<{ Params: { id: string } }>("/api/activities/:id/tasks", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), assigneeId: z.string().uuid().nullish(), dueDate: z.string().date().nullish(), parentId: z.string().uuid().nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || (ctx.activity.type !== "TASKS" && ctx.activity.type !== "TASK_REVIEW")) return reply.code(403).send({ error: "not_in_room" });
    const [created] = await db.insert(sessionTasks).values({ activityId: ctx.activity.id, title: body.data.title, assigneeId: body.data.assigneeId ?? null, dueDate: body.data.dueDate ?? null, parentId: body.data.parentId ?? null, createdBy: req.currentUser!.id, listNodeId: ctx.activity.config?.listNodeId ?? null }).returning({ id: sessionTasks.id });
    await recordTaskEvent(req.currentUser!.id, "created", created.id);
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Task review: focus a task for the whole room (realtime spotlight). null clears it.
  app.post<{ Params: { id: string } }>("/api/activities/:id/spotlight", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ taskId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "TASK_REVIEW") return reply.code(403).send({ error: "not_in_room" });
    await db.update(activities).set({ config: { ...ctx.activity.config, spotlightTaskId: body.data.taskId ?? undefined } }).where(eq(activities.id, ctx.activity.id));
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Tasks: move status (board column) or reassign — collaborative, anyone in the room.
  app.patch<{ Params: { id: string; taskId: string } }>("/api/activities/:id/tasks/:taskId", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ status: z.enum(["TODO", "DOING", "DONE"]).optional(), assigneeId: z.string().uuid().nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "TASKS") return reply.code(403).send({ error: "not_in_room" });
    const patch: Record<string, unknown> = {};
    if (body.data.status) patch.status = body.data.status;
    if (body.data.assigneeId !== undefined) patch.assigneeId = body.data.assigneeId;
    if (Object.keys(patch).length === 0) return { ok: true };
    await db.update(sessionTasks).set(patch).where(and(eq(sessionTasks.id, req.params.taskId), eq(sessionTasks.activityId, ctx.activity.id)));
    await recordTaskEvent(req.currentUser!.id, body.data.status === "DONE" ? "completed" : "updated", req.params.taskId);
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Trivia: submit (or edit) my one prompt during the collecting phase.
  app.post<{ Params: { id: string } }>("/api/activities/:id/trivia/submit", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        format: z.enum(["OPEN", "MC"]),
        prompt: z.string().min(1).max(300),
        answer: z.string().max(300).nullish(),
        options: z.array(z.string().min(1).max(100)).length(4).nullish(),
        correctIndex: z.number().int().min(0).max(3).nullish(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (body.data.format === "MC" && (!body.data.options || body.data.correctIndex == null)) return reply.code(400).send({ error: "mc_needs_options" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "TRIVIA") return reply.code(403).send({ error: "not_in_room" });
    if ((ctx.activity.config?.triviaPhase ?? "COLLECTING") !== "COLLECTING") return reply.code(409).send({ error: "closed" });

    const isMC = body.data.format === "MC";
    const values = {
      format: body.data.format,
      prompt: body.data.prompt,
      answer: isMC ? null : body.data.answer ?? null,
      options: isMC ? body.data.options! : null,
      correctIndex: isMC ? body.data.correctIndex! : null,
    };
    await db
      .insert(triviaSubmissions)
      .values({ activityId: ctx.activity.id, authorId: req.currentUser!.id, ...values })
      .onConflictDoUpdate({ target: [triviaSubmissions.activityId, triviaSubmissions.authorId], set: values });
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Trivia: close submissions and randomly assign each prompt to a teammate (host, or anyone past the deadline).
  app.post<{ Params: { id: string } }>("/api/activities/:id/trivia/close", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "TRIVIA") return reply.code(404).send({ error: "not_found" });
    if (!(await isInRoom(activity.sessionId, me))) return reply.code(403).send({ error: "not_in_room" });
    const cfg = activity.config ?? {};
    if ((cfg.triviaPhase ?? "COLLECTING") !== "COLLECTING") return { ok: true }; // already closed
    if (!(await canRunActivities(activity.sessionId, me))) {
      if (!cfg.triviaDeadline || Date.now() < new Date(cfg.triviaDeadline).getTime() - 1500) return reply.code(425).send({ error: "too_early" });
    }

    const subs = await db.select({ id: triviaSubmissions.id, authorId: triviaSubmissions.authorId }).from(triviaSubmissions).where(eq(triviaSubmissions.activityId, activity.id));
    if (subs.length >= 2) {
      // rotate a shuffled order so each prompt goes to a different teammate (never the author)
      const order = shuffle(subs.map((s) => s.authorId));
      const guesserOf = new Map<string, string>();
      order.forEach((a, i) => guesserOf.set(a, order[(i + 1) % order.length]));
      for (const s of subs) await db.update(triviaSubmissions).set({ assignedToId: guesserOf.get(s.authorId) }).where(eq(triviaSubmissions.id, s.id));
    }
    await db.update(activities).set({ config: { ...cfg, triviaPhase: "ASSIGNED" } }).where(eq(activities.id, activity.id));
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Trivia: reveal all prompts and answers (host/co-host).
  app.post<{ Params: { id: string } }>("/api/activities/:id/trivia/reveal", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "TRIVIA") return reply.code(403).send({ error: "not_host_or_ended" });
    await db.update(activities).set({ config: { ...ctx.activity.config, triviaPhase: "REVEALED" } }).where(eq(activities.id, ctx.activity.id));
    await notify(ctx.session.id);
    return { ok: true };
  });

  // Poll: cast/change my vote (one per person, until the poll closes).
  app.post<{ Params: { id: string } }>("/api/activities/:id/poll/vote", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ optionIndex: z.number().int().min(0) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "POLL") return reply.code(403).send({ error: "not_in_room" });
    const cfg = ctx.activity.config ?? {};
    if (cfg.pollClosed) return reply.code(409).send({ error: "closed" });
    if (body.data.optionIndex >= (cfg.pollOptions?.length ?? 0)) return reply.code(400).send({ error: "bad_option" });
    await db
      .insert(pollVotes)
      .values({ activityId: ctx.activity.id, voterId: req.currentUser!.id, optionIndex: body.data.optionIndex })
      .onConflictDoUpdate({ target: [pollVotes.activityId, pollVotes.voterId], set: { optionIndex: body.data.optionIndex } });
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Word cloud: submit a word (anyone in the room, up to maxPerPerson distinct words).
  app.post<{ Params: { id: string } }>("/api/activities/:id/words", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ word: z.string().min(1).max(40) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "WORDCLOUD") return reply.code(403).send({ error: "not_in_room" });
    const word = body.data.word.trim().toLowerCase().replace(/\s+/g, " ");
    if (!word) return reply.code(400).send({ error: "invalid_input" });
    const max = ctx.activity.config?.maxPerPerson ?? 3;
    const mine = await db.select({ word: wordcloudEntries.word }).from(wordcloudEntries).where(and(eq(wordcloudEntries.activityId, ctx.activity.id), eq(wordcloudEntries.userId, req.currentUser!.id)));
    if (!mine.some((m) => m.word === word) && mine.length >= max) return reply.code(409).send({ error: "max_reached" });
    await db.insert(wordcloudEntries).values({ activityId: ctx.activity.id, userId: req.currentUser!.id, word }).onConflictDoNothing();
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Draw straws: pick a straw (one per person). The straw's hidden length is revealed.
  app.post<{ Params: { id: string; idx: string } }>("/api/activities/:id/straws/:idx/pick", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const ctx = await liveActivityInRoom(req.params.id, me);
    if (!ctx || ctx.activity.type !== "DRAW_STRAWS") return reply.code(403).send({ error: "not_in_room" });
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx)) return reply.code(400).send({ error: "invalid_input" });
    const alreadyMine = await db.select({ id: straws.id }).from(straws).where(and(eq(straws.activityId, ctx.activity.id), eq(straws.pickedBy, me)));
    if (alreadyMine.length) return reply.code(409).send({ error: "already_drew" });
    const [straw] = await db.select().from(straws).where(and(eq(straws.activityId, ctx.activity.id), eq(straws.idx, idx)));
    if (!straw) return reply.code(404).send({ error: "not_found" });
    // Atomic claim so two simultaneous picks can't take the same straw.
    const claimed = await db.update(straws).set({ pickedBy: me, pickedAt: new Date() }).where(and(eq(straws.id, straw.id), isNull(straws.pickedBy))).returning({ id: straws.id });
    if (!claimed.length) return reply.code(409).send({ error: "taken" });
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Team selector: re-randomize the teams (host/co-host).
  app.post<{ Params: { id: string } }>("/api/activities/:id/teams/reshuffle", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "TEAM_SELECT") return reply.code(404).send({ error: "not_found" });
    if (!(await canRunActivities(activity.sessionId, me))) return reply.code(403).send({ error: "not_allowed" });
    const [session] = await db.select({ id: sessions.id, hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, activity.sessionId));
    await seedTeams(activity.id, session, activity.config?.teamCount ?? 2);
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Team selector: move one person to a team (host/co-host).
  app.post<{ Params: { id: string } }>("/api/activities/:id/teams/move", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ userId: z.string().uuid(), teamIndex: z.number().int().min(0).max(5) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "TEAM_SELECT") return reply.code(404).send({ error: "not_found" });
    if (!(await canRunActivities(activity.sessionId, me))) return reply.code(403).send({ error: "not_allowed" });
    if (body.data.teamIndex >= (activity.config?.teamCount ?? 2)) return reply.code(400).send({ error: "bad_team" });
    await db.update(teamAssignments).set({ teamIndex: body.data.teamIndex }).where(and(eq(teamAssignments.activityId, activity.id), eq(teamAssignments.userId, body.data.userId)));
    await notify(activity.sessionId);
    return { ok: true };
  });

  // In-meeting survey: fill it live. Anyone in the room can respond; access is room
  // membership (not the survey's org scope). Reuses the shared response helpers.
  app.post<{ Params: { id: string } }>("/api/activities/:id/survey/save", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ ticket: z.string().optional(), page: z.number().int().min(0).optional(), answers: z.array(z.object({ questionId: z.string().uuid(), value: z.object({ choice: z.number().int().optional(), choices: z.array(z.number().int()).optional(), text: z.string().max(4000).optional(), scale: z.number().int().optional(), other: z.string().max(500).optional() }) })).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "SURVEY") return reply.code(403).send({ error: "not_in_room" });
    const [sv] = await db.select().from(surveys).where(eq(surveys.id, ctx.activity.config?.surveyId ?? ""));
    if (!sv) return reply.code(404).send({ error: "not_found" });
    const r = await saveAnswers(sv, req.currentUser!, body.data);
    if ("error" in r) return reply.code(409).send(r);
    await notify(ctx.sessionId);
    return { ok: true, ticket: r.ticket };
  });

  app.post<{ Params: { id: string } }>("/api/activities/:id/survey/submit", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ ticket: z.string().optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await liveActivityInRoom(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "SURVEY") return reply.code(403).send({ error: "not_in_room" });
    const [sv] = await db.select().from(surveys).where(eq(surveys.id, ctx.activity.config?.surveyId ?? ""));
    if (!sv) return reply.code(404).send({ error: "not_found" });
    const r = await submitResponse(sv, req.currentUser!, body.data.ticket);
    if ("error" in r) return reply.code(r.error === "no_response" ? 404 : 400).send(r);
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Live quiz: host drives the phases (lobby → question → reveal → … → podium).
  app.post<{ Params: { id: string } }>("/api/activities/:id/quiz/advance", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "QUIZ") return reply.code(404).send({ error: "not_found" });
    if (!(await canRunActivities(activity.sessionId, me))) return reply.code(403).send({ error: "not_allowed" });
    const cfg = activity.config ?? {};
    const qs = await db.select({ id: quizQuestions.id, timeLimitSec: quizQuestions.timeLimitSec }).from(quizQuestions).where(eq(quizQuestions.quizId, cfg.quizId ?? "")).orderBy(quizQuestions.position);
    const phase = cfg.quizPhase ?? "LOBBY";
    const idx = cfg.quizIdx ?? -1;
    const openQuestion = (i: number) => ({ quizPhase: "QUESTION", quizIdx: i, quizStartedAt: new Date().toISOString(), quizDeadline: new Date(Date.now() + (qs[i]?.timeLimitSec ?? 20) * 1000).toISOString() });
    let next: Record<string, unknown> | null = null;
    if (phase === "LOBBY") next = qs.length ? openQuestion(0) : { quizPhase: "PODIUM" };
    else if (phase === "QUESTION") next = { quizPhase: "REVEAL" };
    else if (phase === "REVEAL") next = idx + 1 < qs.length ? openQuestion(idx + 1) : { quizPhase: "PODIUM" };
    if (next) await db.update(activities).set({ config: { ...cfg, ...next } }).where(eq(activities.id, activity.id));
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Live quiz: a player locks an answer (once, before the deadline). Graded on submit.
  app.post<{ Params: { id: string } }>("/api/activities/:id/quiz/answer", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ answer: z.object({ indices: z.array(z.number().int()).optional(), bool: z.boolean().optional(), text: z.string().max(500).optional(), order: z.array(z.number().int()).optional(), value: z.number().optional() }) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!.id;
    const ctx = await liveActivityInRoom(req.params.id, me);
    if (!ctx || ctx.activity.type !== "QUIZ") return reply.code(403).send({ error: "not_in_room" });
    const cfg = ctx.activity.config ?? {};
    if (cfg.quizPhase !== "QUESTION") return reply.code(409).send({ error: "not_open" });
    if (cfg.quizDeadline && Date.now() > new Date(cfg.quizDeadline).getTime()) return reply.code(409).send({ error: "too_late" });
    const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, cfg.quizId ?? "")).orderBy(quizQuestions.position);
    const idx = cfg.quizIdx ?? -1;
    const q = qs[idx];
    if (!q) return reply.code(409).send({ error: "not_open" });
    const [existing] = await db.select({ id: quizAnswers.id }).from(quizAnswers).where(and(eq(quizAnswers.activityId, ctx.activity.id), eq(quizAnswers.questionId, q.id), eq(quizAnswers.userId, me)));
    if (existing) return reply.code(409).send({ error: "already_answered" });
    const question = { id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, timeLimitSec: q.timeLimitSec, points: q.points, mediaKind: q.mediaKind, mediaUrl: q.mediaUrl };
    await gradeAndStore(ctx.activity.id, question, idx > 0 ? qs[idx - 1].id : null, me, body.data.answer, cfg.quizStartedAt ? new Date(cfg.quizStartedAt).getTime() : Date.now(), Date.now());
    await notify(ctx.sessionId);
    return { ok: true };
  });

  // Poll: close voting (host/admin, or anyone past the auto-close deadline).
  app.post<{ Params: { id: string } }>("/api/activities/:id/poll/close", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!.id;
    const [activity] = await db.select().from(activities).where(eq(activities.id, req.params.id));
    if (!activity || activity.state !== "LIVE" || activity.type !== "POLL") return reply.code(404).send({ error: "not_found" });
    if (!(await isInRoom(activity.sessionId, me))) return reply.code(403).send({ error: "not_in_room" });
    const cfg = activity.config ?? {};
    if (cfg.pollClosed) return { ok: true };
    if (!(await canRunActivities(activity.sessionId, me))) {
      if (!cfg.pollCloseAt || Date.now() < new Date(cfg.pollCloseAt).getTime() - 1500) return reply.code(425).send({ error: "too_early" });
    }
    await db.update(activities).set({ config: { ...cfg, pollClosed: true } }).where(eq(activities.id, activity.id));
    await notify(activity.sessionId);
    return { ok: true };
  });

  // Poll: export results as CSV (host/co-host). Counts-only when fully anonymous.
  app.get<{ Params: { id: string } }>("/api/activities/:id/poll/export", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await hostActivity(req.params.id, req.currentUser!.id);
    if (!ctx || ctx.activity.type !== "POLL") return reply.code(403).send({ error: "not_host_or_ended" });
    await recordAudit({ action: "poll.exported", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { activityId: ctx.activity.id, sessionId: ctx.session.id } });
    const csv = await pollCsv(ctx.activity);
    return reply.header("content-type", "text/csv").header("content-disposition", `attachment; filename="poll-${ctx.activity.id}.csv"`).send(csv);
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// One straw per person in the room, with distinct lengths 1..N shuffled across positions
// (so a straw's display slot tells you nothing about its length).
async function seedStraws(activityId: string, session: { id: string; hostId: string }) {
  const joined = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.state, "JOINED")));
  const people = new Set(joined.map((j) => j.userId));
  people.add(session.hostId);
  const n = Math.max(2, people.size);
  const lengths = shuffle(Array.from({ length: n }, (_, i) => i + 1));
  await db.insert(straws).values(lengths.map((length, idx) => ({ activityId, idx, length })));
}

// Launching a survey in a session locks its structure (DRAFT → OPEN). It needs no org scope —
// the in-session respond path gates on room membership, not the survey's distribution.
async function openSurveyForActivity(surveyId: string) {
  if (surveyId) await db.update(surveys).set({ status: "OPEN" }).where(and(eq(surveys.id, surveyId), eq(surveys.status, "DRAFT")));
}

// Randomly split the room into `teamCount` teams (balanced — round-robin over a shuffle).
async function seedTeams(activityId: string, session: { id: string; hostId: string }, teamCount: number) {
  const joined = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.state, "JOINED")));
  const people = new Set(joined.map((j) => j.userId));
  people.add(session.hostId);
  const order = shuffle([...people]);
  await db.delete(teamAssignments).where(eq(teamAssignments.activityId, activityId));
  if (order.length) await db.insert(teamAssignments).values(order.map((userId, i) => ({ activityId, userId, teamIndex: i % teamCount })));
}

// Selection window: 30s of picking + a buffer for the intro/reveal animation that runs first.
const RPS_PICK_MS = 30_000;
const RPS_ANIM_MS = 8_000;
const rpsDeadline = () => new Date(Date.now() + RPS_PICK_MS + RPS_ANIM_MS);

type ActivityInput = NonNullable<z.infer<typeof startBody>["config"]>;

// Build an activity's stored config from the raw inputs. Time-relative fields (deadlines) are
// computed from "now", so calling this at launch (not draft creation) gives correct timers.
// Returns { error } for validation failures (missing players/options).
async function buildActivityConfig(
  type: string,
  c: ActivityInput,
  session: { id: string; hostId: string; scopeKind: string | null; scopeId: string | null },
): Promise<{ error: string } | { config: Record<string, unknown> }> {
  if (type === "RANDOMIZER") return { config: { removeAfterPick: c.removeAfterPick !== false, includeHost: c.includeHost === true } };
  if (type === "NOMINATION") return { config: { anonymous: c.anonymous !== false, showCounts: c.showCounts !== false, timerSeconds: c.timerSeconds } };
  if (type === "RPS") {
    if (!c.player1Id || !c.player2Id || c.player1Id === c.player2Id) return { error: "need_two_players" };
    const joined = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.state, "JOINED")));
    const set = new Set(joined.map((j) => j.userId));
    set.add(session.hostId);
    if (!set.has(c.player1Id) || !set.has(c.player2Id)) return { error: "players_not_in_room" };
    return { config: { bestOf: c.bestOf ?? 3, agreementKind: c.agreementKind ?? "LOSER", agreementText: c.agreementText ?? "", player1Id: c.player1Id, player2Id: c.player2Id } };
  }
  if (type === "TASKS" || type === "TASK_REVIEW") {
    let listNodeId = session.scopeKind === "NODE" ? session.scopeId : null;
    if (!listNodeId) {
      const [host] = await db.select({ nodeId: users.nodeId }).from(users).where(eq(users.id, session.hostId));
      listNodeId = host?.nodeId ?? null;
    }
    return { config: { listNodeId: listNodeId ?? undefined } };
  }
  if (type === "TRIVIA") {
    const secs = c.timerSeconds;
    return { config: { timerSeconds: secs, triviaPhase: "COLLECTING", triviaDeadline: secs ? new Date(Date.now() + secs * 1000).toISOString() : undefined } };
  }
  if (type === "WORDCLOUD") return { config: { maxPerPerson: c.maxPerPerson ?? 3 } };
  if (type === "DRAW_STRAWS") return { config: {} };
  if (type === "TEAM_SELECT") return { config: { teamCount: c.teamCount ?? 2 } };
  if (type === "SURVEY") {
    if (!c.surveyId) return { error: "no_survey" };
    const [sv] = await db.select().from(surveys).where(eq(surveys.id, c.surveyId));
    const [host] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, session.hostId));
    if (!sv || sv.tenantId !== host?.tenantId) return { error: "no_survey" };
    const [q] = await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, sv.id)).limit(1);
    if (!q) return { error: "survey_empty" };
    return { config: { surveyId: sv.id } };
  }
  if (type === "QUIZ") {
    if (!c.quizId) return { error: "no_quiz" };
    const [qz] = await db.select().from(quizzes).where(eq(quizzes.id, c.quizId));
    const [host] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, session.hostId));
    if (!qz || qz.tenantId !== host?.tenantId) return { error: "no_quiz" };
    const [q] = await db.select({ id: quizQuestions.id }).from(quizQuestions).where(eq(quizQuestions.quizId, qz.id)).limit(1);
    if (!q) return { error: "quiz_empty" };
    return { config: { quizId: qz.id, quizPhase: "LOBBY", quizIdx: -1 } };
  }
  if (type === "POLL") {
    if (!c.pollOptions || c.pollOptions.length < 2) return { error: "poll_needs_options" };
    return {
      config: {
        pollOptions: c.pollOptions,
        anonymity: c.anonymity ?? "ANON_ROOM",
        resultsVisibility: c.resultsVisibility ?? "LIVE",
        chartType: c.chartType ?? "BAR",
        pollCloseAt: c.closeSeconds ? new Date(Date.now() + c.closeSeconds * 1000).toISOString() : undefined,
        pollClosed: false,
      },
    };
  }
  return { config: { description: c.description } };
}

function rpsBeats(a: string, b: string): boolean {
  return (a === "ROCK" && b === "SCISSORS") || (a === "PAPER" && b === "ROCK") || (a === "SCISSORS" && b === "PAPER");
}

type RpsRoundRow = { id: string; roundNo: number; p1Choice: string | null; p2Choice: string | null; p1Forfeit: boolean; p2Forfeit: boolean };
function rpsWinner(r: RpsRoundRow): "P1" | "P2" | "TIE" {
  if (r.p1Forfeit && r.p2Forfeit) return "TIE";
  if (r.p1Forfeit) return "P2";
  if (r.p2Forfeit) return "P1";
  return r.p1Choice === r.p2Choice ? "TIE" : rpsBeats(r.p1Choice!, r.p2Choice!) ? "P1" : "P2";
}

// Resolve a round, then either start the next one or let the match end (best-of reached, or 2 forfeits).
async function advanceRps(activity: { id: string; config: { bestOf?: number } | null }, round: RpsRoundRow) {
  await db.update(rpsRounds).set({ winner: rpsWinner(round) }).where(eq(rpsRounds.id, round.id));
  const all = await db.select().from(rpsRounds).where(eq(rpsRounds.activityId, activity.id));
  const p1Wins = all.filter((x) => x.winner === "P1").length;
  const p2Wins = all.filter((x) => x.winner === "P2").length;
  const p1Forfeits = all.filter((x) => x.p1Forfeit).length;
  const p2Forfeits = all.filter((x) => x.p2Forfeit).length;
  const threshold = Math.floor((activity.config?.bestOf ?? 3) / 2) + 1;
  const over = p1Forfeits >= 2 || p2Forfeits >= 2 || p1Wins >= threshold || p2Wins >= threshold;
  if (!over) {
    // onConflictDoNothing: two clients can resolve a timed-out round at once — only one next round is created.
    await db.insert(rpsRounds).values({ activityId: activity.id, roundNo: round.roundNo + 1, deadlineAt: rpsDeadline() }).onConflictDoNothing();
  }
}

// Live activity + the user is in its room (for participatory contributions).
async function liveActivityInRoom(activityId: string, userId: string) {
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!activity || activity.state !== "LIVE") return null;
  return (await isInRoom(activity.sessionId, userId)) ? { activity, sessionId: activity.sessionId } : null;
}

// --- helpers ---

async function hostedLiveSession(sessionId: string, userId: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s || s.state !== "LIVE") return null;
  return (await canRunActivities(sessionId, userId)) ? s : null;
}

async function hostActivity(activityId: string, userId: string) {
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!activity || activity.state !== "LIVE") return null;
  const session = await hostedLiveSession(activity.sessionId, userId);
  return session ? { activity, session } : null;
}

// Any activity change refreshes the room (clients refetch session detail over WS).
async function notify(sessionId: string) {
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  const parts = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  const targets = new Set(parts.map((p) => p.userId));
  if (s) targets.add(s.hostId);
  hub.sendToUsers([...targets], { type: "session.update", sessionId });
}
