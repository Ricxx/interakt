import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, count, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { activities, activityPicks, activityVotes, agendaItems, brainstormComments, brainstormIdeas, brainstormLikes, groups, inviteBatches, orgNodes, rpsRounds, sessions, sessionChatReads, sessionEvents, sessionMessages, sessionParticipants, sessionTasks, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { peopleInScope } from "../../lib/scope.js";
import { hub, type RealtimeEvent } from "../../lib/realtime.js";
import { canControlSession } from "../../lib/sessionControl.js";
import { listIdeas } from "../../lib/ideas.js";
import { buildReviewPayload } from "../tasks/review.js";
import { buildTriviaPayload, triviaReveal } from "../trivia/payload.js";
import { buildPollPayload, pollResults } from "../poll/payload.js";
import { buildWordcloudPayload, wordcloudResults } from "../wordcloud/payload.js";
import { buildQnaPayload } from "../qna/payload.js";
import { buildDotPayload } from "../dot/payload.js";
import { buildFistPayload } from "../fist/payload.js";
import { buildPokerPayload } from "../poker/payload.js";
import { buildStrawsPayload, strawsResults } from "../straws/payload.js";
import { buildTeamsPayload, teamsResults } from "../teams/payload.js";
import { buildSurveyActivityPayload } from "../surveys/respond.js";
import { buildQuizPayload, quizResults } from "../quizzes/game.js";
import { recordAudit } from "../../lib/audit.js";
import { can, isGoverned } from "../../lib/capabilities.js";

const startBody = z.object({
  title: z.string().min(1).max(160),
  // Audience is optional now — you invite people after creating the session.
  // (Rehost still passes a scope to auto-invite as a convenience.)
  scopeKind: z.enum(["ALL", "NODE", "GROUP"]).optional(),
  scopeId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime().optional(), // present -> SCHEDULED, else LIVE now
});

const ACTIVE_PARTICIPANT = ["INVITED", "JOINED"] as const;

export function sessionRoutes(app: FastifyInstance) {
  // Host: create a session. Live now (no scheduledAt) or scheduled for later.
  // You invite people afterward; a scope here is an optional auto-invite (rehost).
  app.post("/api/sessions/start", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = startBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const host = req.currentUser!;
    // Governed users need the "schedule sessions" capability; ungoverned users (no permission
    // group) and admins keep legacy access. can() already returns true for TENANT_ADMIN.
    if ((await isGoverned(host.id)) && !(await can(host, "session.schedule"))) {
      return reply.code(403).send({ error: "not_allowed" });
    }
    const { title, scopeKind, scopeId, scheduledAt } = parsed.data;
    const live = !scheduledAt;

    const [session] = await db
      .insert(sessions)
      .values({
        tenantId: host.tenantId,
        hostId: host.id,
        creatorId: host.id,
        title,
        joinCode: genCode(),
        scopeKind: scopeKind ?? null,
        scopeId: scopeId ?? null,
        state: live ? "LIVE" : "SCHEDULED",
        startedAt: live ? new Date() : null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      })
      .returning();

    let invited = 0;
    if (live && scopeKind) {
      const audience = await peopleInScope(host.tenantId, scopeKind, scopeId ?? null);
      const invitees = audience.filter((p) => p.id !== host.id);
      if (invitees.length) {
        await db.insert(sessionParticipants).values(invitees.map((p) => ({ sessionId: session.id, userId: p.id })));
        hub.sendToUsers(invitees.map((p) => p.id), { type: "session.invite", sessionId: session.id, title: session.title, hostName: host.displayName } as RealtimeEvent);
        invited = invitees.length;
      }
    }
    return { session: { id: session.id, title: session.title }, invited };
  });

  // Host: start a scheduled session now.
  app.post<{ Params: { id: string } }>("/api/sessions/:id/go-live", { preHandler: requireAuth }, async (req, reply) => {
    const session = await hostSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_host" });
    if (session.state !== "SCHEDULED") return reply.code(409).send({ error: "not_scheduled" });
    await db.update(sessions).set({ state: "LIVE", startedAt: new Date() }).where(eq(sessions.id, session.id));
    // Re-pop the invite for anyone invited while it was scheduled.
    const invited = await db
      .select({ userId: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.state, "INVITED")));
    if (invited.length) {
      hub.sendToUsers(invited.map((x) => x.userId), { type: "session.invite", sessionId: session.id, title: session.title, hostName: req.currentUser!.displayName } as RealtimeEvent);
    }
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Session detail (host control view + participant view).
  app.get<{ Params: { id: string } }>("/api/sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.tenantId, me.tenantId)));
    if (!session) return reply.code(404).send({ error: "not_found" });

    const [host] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, session.hostId));
    const participants = await db
      .select({ userId: sessionParticipants.userId, name: users.displayName, node: orgNodes.name, nodeId: users.nodeId, state: sessionParticipants.state, role: sessionParticipants.sessionRole, accessRevoked: sessionParticipants.accessRevoked })
      .from(sessionParticipants)
      .innerJoin(users, eq(users.id, sessionParticipants.userId))
      .leftJoin(orgNodes, eq(users.nodeId, orgNodes.id))
      .where(eq(sessionParticipants.sessionId, session.id))
      .orderBy(users.displayName);

    const mine = participants.find((p) => p.userId === me.id);
    // Only the host/creator and non-revoked participants can see the session + its log.
    const hasAccess = session.hostId === me.id || session.creatorId === me.id || (!!mine && !mine.accessRevoked);
    if (!hasAccess) return reply.code(403).send({ error: "no_access" });

    // Unread chat for the badge: messages from others since my last read.
    const [read] = await db.select({ lastReadAt: sessionChatReads.lastReadAt }).from(sessionChatReads).where(and(eq(sessionChatReads.sessionId, session.id), eq(sessionChatReads.userId, me.id)));
    const unreadConds = [eq(sessionMessages.sessionId, session.id), ne(sessionMessages.userId, me.id)];
    if (read?.lastReadAt) unreadConds.push(gt(sessionMessages.createdAt, read.lastReadAt));
    const [{ c: unreadChat }] = await db.select({ c: count() }).from(sessionMessages).where(and(...unreadConds));
    const myRole = session.hostId === me.id ? "HOST" : mine?.role === "COHOST" ? "COHOST" : mine?.role === "ACTIVITY_ADMIN" ? "ACTIVITY_ADMIN" : mine ? "MEMBER" : null;
    const canRunActivities = myRole === "HOST" || myRole === "COHOST" || myRole === "ACTIVITY_ADMIN";
    return {
      session: { id: session.id, title: session.title, state: session.state, joinCode: session.joinCode, joinPolicy: session.settings?.joinPolicy ?? "OPEN", participantStart: session.settings?.participantStart ?? true, participantTypes: session.settings?.participantTypes ?? ["RPS"], scheduledAt: session.scheduledAt?.toISOString() ?? null, hostId: session.hostId, hostName: host?.name ?? "", audience: await audienceLabel(session) },
      isHost: session.hostId === me.id,
      isCreator: session.creatorId === me.id,
      myRole,
      canControl: myRole === "HOST" || myRole === "COHOST",
      canRunActivities,
      myState: mine?.state ?? null,
      participants,
      currentActivity: await currentActivity(session.id, me.id, session.hostId === me.id, canRunActivities),
      pastActivities: await pastActivities(session.id, me.id),
      inviteBatches: await inviteBatchList(session.id),
      events: await participantEvents(session.id),
      agenda: await agendaList(session.id, session.activeAgendaId),
      drafts: await draftList(session.id),
      unreadChat,
    };
  });

  // Host: their own live sessions (so stale ones can be found and ended).
  app.get("/api/sessions/hosting", { preHandler: requireAuth }, async (req) => {
    const rows = await db
      .select({ id: sessions.id, title: sessions.title, state: sessions.state, joinCode: sessions.joinCode, scheduledAt: sessions.scheduledAt })
      .from(sessions)
      .where(and(eq(sessions.hostId, req.currentUser!.id), inArray(sessions.state, ["LIVE", "SCHEDULED"])))
      .orderBy(sessions.createdAt);
    return { sessions: rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt?.toISOString() ?? null })) };
  });

  // Host: people who can still be invited (everyone not already active in this session).
  app.get<{ Params: { id: string } }>("/api/sessions/:id/candidates", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const session = await hostSession(req.params.id, me.id);
    if (!session) return reply.code(403).send({ error: "not_host" });
    const active = await db
      .select({ userId: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, session.id), inArray(sessionParticipants.state, [...ACTIVE_PARTICIPANT])));
    const taken = new Set(active.map((a) => a.userId));
    const all = await peopleInScope(me.tenantId, "ALL", null);
    return { people: all.filter((p) => !taken.has(p.id) && p.id !== me.id) };
  });

  // Join: enter the room, and auto-leave any other live session (one active at a time).
  app.post<{ Params: { id: string } }>("/api/sessions/:id/join", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const [session] = await db.select().from(sessions).where(eq(sessions.id, req.params.id));
    if (!session) return reply.code(404).send({ error: "not_found" });
    if (session.state !== "LIVE") return reply.code(409).send({ error: "session_not_live" });

    const [part] = await db
      .select()
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, userId)));
    if (!part || part.state === "REMOVED") return reply.code(409).send({ error: "not_a_participant" });
    await doJoin(userId, session.id);
    return { ok: true };
  });

  // Join by shared code: "Join session ABC123". Works even without a prior invite.
  app.post("/api/sessions/join-by-code", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ code: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tenantId, me.tenantId), eq(sessions.joinCode, body.data.code.trim().toUpperCase()), eq(sessions.state, "LIVE")));
    if (!session) return reply.code(404).send({ error: "not_found" });
    if (session.hostId === me.id) return { sessionId: session.id }; // host just opens it

    const [part] = await db
      .select()
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, me.id)));

    // Approval policy: strangers and previously-removed people wait for the host.
    // (Removal is a soft kick — they can knock again.) Prior invitees skip the lobby.
    const policy = session.settings?.joinPolicy ?? "OPEN";
    const invitedBefore = part && part.state !== "REMOVED" && part.state !== "PENDING";
    if (policy === "APPROVAL" && !invitedBefore) {
      await db
        .insert(sessionParticipants)
        .values({ sessionId: session.id, userId: me.id, state: "PENDING" })
        .onConflictDoUpdate({ target: [sessionParticipants.sessionId, sessionParticipants.userId], set: { state: "PENDING", respondedAt: null } });
      await notifySession(session.id, { type: "session.update", sessionId: session.id });
      return { sessionId: session.id, pending: true };
    }
    await doJoin(me.id, session.id);
    return { sessionId: session.id };
  });

  // Host/co-host: admit or deny someone waiting in the lobby.
  app.post<{ Params: { id: string; userId: string } }>("/api/sessions/:id/participants/:userId/approve", { preHandler: requireAuth }, async (req, reply) => {
    const session = await controlSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_allowed" });
    await doJoin(req.params.userId, session.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string; userId: string } }>("/api/sessions/:id/participants/:userId/deny", { preHandler: requireAuth }, async (req, reply) => {
    const session = await controlSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_allowed" });
    await db.update(sessionParticipants).set({ state: "REMOVED", respondedAt: new Date() }).where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, req.params.userId)));
    await recordEvent(session.id, req.params.userId, "removed");
    hub.sendToUser(req.params.userId, { type: "session.invite.cancelled", sessionId: session.id });
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Host: update meeting settings (extensible).
  app.patch<{ Params: { id: string } }>("/api/sessions/:id/settings", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        joinPolicy: z.enum(["OPEN", "APPROVAL"]).optional(),
        participantStart: z.boolean().optional(),
        participantTypes: z.array(z.enum(["RANDOMIZER", "NOMINATION", "BRAINSTORM", "RPS", "TASKS", "TASK_REVIEW", "TRIVIA", "POLL"])).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const session = await hostSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_host" });
    await db.update(sessions).set({ settings: { ...session.settings, ...body.data } }).where(eq(sessions.id, session.id));
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/sessions/:id/decline", { preHandler: requireAuth }, (req, reply) =>
    transition(req.params.id, req.currentUser!.id, reply, { allowedFrom: ["INVITED", "MISSED"], to: "DECLINED", liveOnly: true }),
  );
  app.post<{ Params: { id: string } }>("/api/sessions/:id/leave", { preHandler: requireAuth }, (req, reply) =>
    transition(req.params.id, req.currentUser!.id, reply, { allowedFrom: ["JOINED"], to: "LEFT", liveOnly: true }),
  );

  // Host: remove a participant (also cancels their pending invite popup).
  app.post<{ Params: { id: string; userId: string } }>("/api/sessions/:id/participants/:userId/remove", { preHandler: requireAuth }, async (req, reply) => {
    const session = await controlSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_allowed" });
    if (req.params.userId === session.hostId) return reply.code(403).send({ error: "cannot_remove_host" });
    await db
      .update(sessionParticipants)
      .set({ state: "REMOVED", respondedAt: new Date() })
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, req.params.userId)));
    await recordEvent(session.id, req.params.userId, "removed");
    hub.sendToUser(req.params.userId, { type: "session.invite.cancelled", sessionId: session.id });
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Host: revoke a person's access entirely — removes them and hides the session/log
  // from them (drops out of their history). Stronger than "remove". Re-inviting restores it.
  app.post<{ Params: { id: string; userId: string } }>("/api/sessions/:id/participants/:userId/revoke", { preHandler: requireAuth }, async (req, reply) => {
    const session = await hostSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_host" });
    if (req.params.userId === session.hostId || req.params.userId === session.creatorId) return reply.code(403).send({ error: "cannot_revoke" });
    await db
      .update(sessionParticipants)
      .set({ state: "REMOVED", accessRevoked: true, respondedAt: new Date() })
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, req.params.userId)));
    await recordEvent(session.id, req.params.userId, "removed");
    hub.sendToUser(req.params.userId, { type: "session.invite.cancelled", sessionId: session.id });
    hub.sendToUser(req.params.userId, { type: "session.update", sessionId: session.id });
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Host: (re)invite a specific person.
  app.post<{ Params: { id: string } }>("/api/sessions/:id/invite", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const host = req.currentUser!;
    const session = await controlSession(req.params.id, host.id);
    if (!session || (session.state !== "LIVE" && session.state !== "SCHEDULED")) return reply.code(403).send({ error: "not_allowed_or_ended" });

    await db
      .insert(sessionParticipants)
      .values({ sessionId: session.id, userId: body.data.userId })
      .onConflictDoUpdate({ target: [sessionParticipants.sessionId, sessionParticipants.userId], set: { state: "INVITED", respondedAt: null, accessRevoked: false } });
    // Popup only for a live session; for a scheduled one it just shows on their dashboard/upcoming.
    if (session.state === "LIVE") hub.sendToUser(body.data.userId, { type: "session.invite", sessionId: session.id, title: session.title, hostName: host.displayName });
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Host: end the session. Anyone still only invited is marked MISSED (for history).
  app.post<{ Params: { id: string } }>("/api/sessions/:id/end", { preHandler: requireAuth }, async (req, reply) => {
    const session = await hostSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_host" });
    await db.update(sessions).set({ state: "ENDED", endedAt: new Date() }).where(eq(sessions.id, session.id));
    await db
      .update(sessionParticipants)
      .set({ state: "MISSED" })
      .where(and(eq(sessionParticipants.sessionId, session.id), inArray(sessionParticipants.state, ["INVITED"])));
    await notifySession(session.id, { type: "session.ended", sessionId: session.id });
    await recordAudit({ action: "session.ended", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { sessionId: session.id, title: session.title } });
    return { ok: true };
  });

  // Host/co-host: how many *new* people a scope would invite (for the "are you sure").
  app.get<{ Params: { id: string }; Querystring: { scopeKind: "ALL" | "NODE" | "GROUP"; scopeId?: string } }>(
    "/api/sessions/:id/scope-preview",
    { preHandler: requireAuth },
    async (req, reply) => {
      const session = await controlSession(req.params.id, req.currentUser!.id);
      if (!session) return reply.code(403).send({ error: "not_allowed" });
      const eligible = await eligibleForScope(session, req.query.scopeKind, req.query.scopeId ?? null);
      return { count: eligible.length };
    },
  );

  // Host/co-host: bulk-invite everyone in a scope, as a cancellable batch.
  app.post<{ Params: { id: string } }>("/api/sessions/:id/invite-scope", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ scopeKind: z.enum(["ALL", "NODE", "GROUP"]), scopeId: z.string().uuid().nullable().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const session = await controlSession(req.params.id, req.currentUser!.id);
    if (!session || (session.state !== "LIVE" && session.state !== "SCHEDULED")) return reply.code(403).send({ error: "not_allowed_or_ended" });

    const eligible = await eligibleForScope(session, body.data.scopeKind, body.data.scopeId ?? null);
    if (eligible.length === 0) return { invited: 0 };

    const label = await audienceLabel({ scopeKind: body.data.scopeKind, scopeId: body.data.scopeId ?? null });
    const [batch] = await db
      .insert(inviteBatches)
      .values({ sessionId: session.id, scopeLabel: label, count: eligible.length, createdBy: req.currentUser!.id })
      .returning();
    await db
      .insert(sessionParticipants)
      .values(eligible.map((p) => ({ sessionId: session.id, userId: p.id, batchId: batch.id })))
      // Re-inviting previously removed/declined people updates their row instead of erroring.
      .onConflictDoUpdate({
        target: [sessionParticipants.sessionId, sessionParticipants.userId],
        set: { state: "INVITED", batchId: batch.id, respondedAt: null, accessRevoked: false },
      });
    if (session.state === "LIVE") {
      hub.sendToUsers(eligible.map((p) => p.id), { type: "session.invite", sessionId: session.id, title: session.title, hostName: req.currentUser!.displayName } as RealtimeEvent);
    }
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { batchId: batch.id, invited: eligible.length };
  });

  // Host/co-host: cancel a whole invite batch (dismisses pending invites), with a reason for the log.
  app.post<{ Params: { id: string; batchId: string } }>("/api/sessions/:id/invite-batches/:batchId/cancel", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ reason: z.string().max(300).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const session = await controlSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_allowed" });

    await db.update(inviteBatches).set({ cancelledAt: new Date(), cancelReason: body.data.reason ?? null }).where(and(eq(inviteBatches.id, req.params.batchId), eq(inviteBatches.sessionId, session.id)));
    const pending = await db
      .select({ userId: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.batchId, req.params.batchId), eq(sessionParticipants.state, "INVITED")));
    if (pending.length) {
      await db.update(sessionParticipants).set({ state: "REMOVED" }).where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.batchId, req.params.batchId), eq(sessionParticipants.state, "INVITED")));
      hub.sendToUsers(pending.map((p) => p.userId), { type: "session.invite.cancelled", sessionId: session.id });
    }
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true, dismissed: pending.length };
  });

  // Host: empower / demote a co-host.
  // Host: set a participant's session role — co-host (full control), activity admin (activities only), or none.
  app.post<{ Params: { id: string; userId: string } }>("/api/sessions/:id/participants/:userId/role", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ role: z.enum(["COHOST", "ACTIVITY_ADMIN", "MEMBER"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const session = await hostSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_host" });
    await db
      .update(sessionParticipants)
      .set({ sessionRole: body.data.role === "MEMBER" ? null : body.data.role })
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, req.params.userId)));
    await recordAudit({ action: "session.role_set", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { sessionId: session.id, userId: req.params.userId, role: body.data.role } });
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Creator: reclaim host (e.g. after a disconnect handed it to a co-host).
  app.post<{ Params: { id: string } }>("/api/sessions/:id/reclaim", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [s] = await db.select().from(sessions).where(eq(sessions.id, req.params.id));
    if (!s || s.creatorId !== me.id) return reply.code(403).send({ error: "not_creator" });
    if (s.state !== "LIVE") return reply.code(409).send({ error: "not_live" });
    if (s.hostId === me.id) return { ok: true };
    // Demote the current host to co-host, take over as host.
    await db
      .insert(sessionParticipants)
      .values({ sessionId: s.id, userId: s.hostId, state: "JOINED", sessionRole: "COHOST", respondedAt: new Date() })
      .onConflictDoUpdate({ target: [sessionParticipants.sessionId, sessionParticipants.userId], set: { state: "JOINED", sessionRole: "COHOST" } });
    await db.update(sessions).set({ hostId: me.id }).where(eq(sessions.id, s.id));
    await db.update(sessionParticipants).set({ sessionRole: null }).where(and(eq(sessionParticipants.sessionId, s.id), eq(sessionParticipants.userId, me.id)));
    await notifySession(s.id, { type: "session.update", sessionId: s.id });
    return { ok: true };
  });

  // Host: hand the session to another participant. The old host stays as a co-host.
  app.post<{ Params: { id: string } }>("/api/sessions/:id/pass-host", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const session = await hostSession(req.params.id, req.currentUser!.id);
    if (!session) return reply.code(403).send({ error: "not_host" });

    const [target] = await db
      .select({ state: sessionParticipants.state })
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, body.data.userId)));
    if (!target || target.state !== "JOINED") return reply.code(400).send({ error: "must_be_joined" });

    await db.update(sessions).set({ hostId: body.data.userId }).where(eq(sessions.id, session.id));
    // new host shouldn't also carry a cohost flag; old host becomes a joined co-host.
    await db.update(sessionParticipants).set({ sessionRole: null }).where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, body.data.userId)));
    await db
      .insert(sessionParticipants)
      .values({ sessionId: session.id, userId: session.hostId, state: "JOINED", sessionRole: "COHOST", respondedAt: new Date() })
      .onConflictDoUpdate({ target: [sessionParticipants.sessionId, sessionParticipants.userId], set: { state: "JOINED", sessionRole: "COHOST" } });
    await notifySession(session.id, { type: "session.update", sessionId: session.id });
    return { ok: true };
  });

  // Recent sessions this user has hosted — for one-click "rehost" (remembered setups).
  app.get("/api/sessions/recent", { preHandler: requireAuth }, async (req) => {
    const rows = await db
      .select({ title: sessions.title, scopeKind: sessions.scopeKind, scopeId: sessions.scopeId, createdAt: sessions.createdAt })
      .from(sessions)
      .where(eq(sessions.hostId, req.currentUser!.id))
      .orderBy(desc(sessions.createdAt))
      .limit(20);
    // De-dup by title + scope, keep most recent, cap at 6.
    const seen = new Set<string>();
    const recent: { title: string; scopeKind: string | null; scopeId: string | null; audience: string }[] = [];
    for (const r of rows) {
      const key = `${r.title}|${r.scopeKind}|${r.scopeId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recent.push({ title: r.title, scopeKind: r.scopeKind, scopeId: r.scopeId, audience: await audienceLabel(r) });
      if (recent.length >= 6) break;
    }
    return { recent };
  });

  // Past sessions I hosted or attended (for review). Opens to the session's log.
  app.get("/api/sessions/history", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const hosted = await db
      .select({ id: sessions.id, title: sessions.title, joinCode: sessions.joinCode, endedAt: sessions.endedAt, hostName: users.displayName })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.hostId))
      .where(and(eq(sessions.hostId, me.id), eq(sessions.state, "ENDED")));
    const attended = await db
      .select({ id: sessions.id, title: sessions.title, joinCode: sessions.joinCode, endedAt: sessions.endedAt, hostName: users.displayName })
      .from(sessionParticipants)
      .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
      .innerJoin(users, eq(users.id, sessions.hostId))
      .where(and(eq(sessionParticipants.userId, me.id), eq(sessions.state, "ENDED"), eq(sessionParticipants.accessRevoked, false)));

    const map = new Map<string, { id: string; title: string; joinCode: string | null; hostName: string; endedAt: Date | null; iHosted: boolean }>();
    for (const s of hosted) map.set(s.id, { ...s, iHosted: true });
    for (const s of attended) if (!map.has(s.id)) map.set(s.id, { ...s, iHosted: false });
    const history = [...map.values()]
      .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))
      .slice(0, 30)
      .map((s) => ({ id: s.id, title: s.title, joinCode: s.joinCode, hostName: s.hostName, endedAt: s.endedAt?.toISOString() ?? null, iHosted: s.iHosted }));
    return { history };
  });

  // Dashboard recovery: my pending/active session invites + rooms I'm in.
  app.get("/api/me/invites", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db
      .select({ id: sessions.id, title: sessions.title, hostName: users.displayName, myState: sessionParticipants.state, state: sessions.state, joinCode: sessions.joinCode, scheduledAt: sessions.scheduledAt })
      .from(sessionParticipants)
      .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
      .innerJoin(users, eq(users.id, sessions.hostId))
      .where(
        and(
          eq(sessionParticipants.userId, me.id),
          inArray(sessions.state, ["LIVE", "SCHEDULED"]),
          inArray(sessionParticipants.state, ["INVITED", "JOINED", "MISSED", "LEFT"]),
        ),
      );
    return { invites: rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt?.toISOString() ?? null })) };
  });
}

// --- helpers ---

// The session's live activity (if any) + its picks, so the whole room sees the same thing.
async function currentActivity(sessionId: string, meId: string, isHost: boolean, canControl: boolean) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.sessionId, sessionId), eq(activities.state, "LIVE")))
    .limit(1);
  if (!activity) return null;
  const base = { id: activity.id, type: activity.type, title: activity.title, config: activity.config, picks: await pickList(activity.id) };

  if (activity.type === "BRAINSTORM") {
    return { ...base, brainstorm: { ideas: await brainstormIdeaList(activity.id, meId) } };
  }

  if (activity.type === "TASKS") {
    return { ...base, tasks: await taskList(activity.id) };
  }

  if (activity.type === "TASK_REVIEW") {
    return { ...base, taskReview: await buildReviewPayload(activity) };
  }

  if (activity.type === "TRIVIA") {
    return { ...base, trivia: await buildTriviaPayload(activity, meId) };
  }

  if (activity.type === "POLL") {
    return { ...base, poll: await buildPollPayload(activity, meId, canControl) };
  }

  if (activity.type === "WORDCLOUD") {
    return { ...base, wordcloud: await buildWordcloudPayload(activity, meId) };
  }

  if (activity.type === "QNA") {
    return { ...base, qna: await buildQnaPayload(activity, meId, canControl) };
  }

  if (activity.type === "DOT_VOTE") {
    return { ...base, dot: await buildDotPayload(activity, meId) };
  }

  if (activity.type === "FIST") {
    return { ...base, fist: await buildFistPayload(activity, meId) };
  }

  if (activity.type === "POKER") {
    return { ...base, poker: await buildPokerPayload(activity, meId) };
  }

  if (activity.type === "DRAW_STRAWS") {
    return { ...base, straws: await buildStrawsPayload(activity.id, meId) };
  }

  if (activity.type === "TEAM_SELECT") {
    return { ...base, teams: await buildTeamsPayload(activity, meId) };
  }

  if (activity.type === "SURVEY") {
    return { ...base, survey: activity.config?.surveyId ? await buildSurveyActivityPayload(activity.config.surveyId, meId) : null };
  }

  if (activity.type === "QUIZ") {
    return { ...base, quiz: await buildQuizPayload(activity, meId, canControl) };
  }

  if (activity.type === "TIC_TAC_TOE" || activity.type === "CONNECT_FOUR" || activity.type === "CHECKERS") {
    const cfg = activity.config ?? {};
    const slot = cfg.player1Id === meId ? 1 : cfg.player2Id === meId ? 2 : null;
    const [p1] = cfg.player1Id ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, cfg.player1Id)) : [];
    const [p2] = cfg.player2Id ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, cfg.player2Id)) : [];
    return {
      ...base,
      board: {
        game: activity.type,
        player1: { name: p1?.name ?? "" },
        player2: { name: p2?.name ?? "" },
        myPlayer: slot,
        cells: cfg.board ?? [],
        turn: cfg.turn ?? 1,
        winner: cfg.winner ?? null,
        lastMove: cfg.lastMove ?? null,
        mustJumpFrom: cfg.mustJumpFrom ?? null,
        agreementKind: cfg.agreementKind ?? "LOSER",
        agreementText: cfg.agreementText ?? "",
      },
    };
  }

  if (activity.type === "RPS") {
    const cfg = activity.config ?? {};
    const rounds = await db.select().from(rpsRounds).where(eq(rpsRounds.activityId, activity.id)).orderBy(rpsRounds.roundNo);
    const p1Wins = rounds.filter((r) => r.winner === "P1").length;
    const p2Wins = rounds.filter((r) => r.winner === "P2").length;
    const p1Forfeits = rounds.filter((r) => r.p1Forfeit).length;
    const p2Forfeits = rounds.filter((r) => r.p2Forfeit).length;
    const threshold = Math.floor((cfg.bestOf ?? 3) / 2) + 1;
    // Two forfeits loses the match outright; otherwise it's first to the best-of threshold.
    const matchWinner = p1Forfeits >= 2 ? 2 : p2Forfeits >= 2 ? 1 : p1Wins >= threshold ? 1 : p2Wins >= threshold ? 2 : null;
    const current = rounds.find((r) => !r.winner);
    const slot = cfg.player1Id === meId ? 1 : cfg.player2Id === meId ? 2 : null;
    const [p1] = cfg.player1Id ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, cfg.player1Id)) : [];
    const [p2] = cfg.player2Id ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, cfg.player2Id)) : [];
    const forfeitLoser = p1Forfeits >= 2 ? p1?.name : p2Forfeits >= 2 ? p2?.name : null;
    return {
      ...base,
      rps: {
        bestOf: cfg.bestOf ?? 3,
        agreementKind: cfg.agreementKind ?? "LOSER",
        agreementText: cfg.agreementText ?? "",
        player1: { name: p1?.name ?? "" },
        player2: { name: p2?.name ?? "" },
        myPlayer: slot,
        scores: { p1: p1Wins, p2: p2Wins },
        matchWinner,
        endedReason: forfeitLoser ? `${forfeitLoser} forfeited 2 rounds (timed out)` : null,
        currentRound: current
          ? { roundNo: current.roundNo, p1Locked: !!current.p1Choice, p2Locked: !!current.p2Choice, myLocked: slot === 1 ? !!current.p1Choice : slot === 2 ? !!current.p2Choice : false, deadline: current.deadlineAt?.toISOString() ?? null }
          : null,
        rounds: rounds.filter((r) => r.winner).map((r) => ({ roundNo: r.roundNo, p1Choice: r.p1Choice, p2Choice: r.p2Choice, p1Forfeit: r.p1Forfeit, p2Forfeit: r.p2Forfeit, winner: r.winner })),
      },
    };
  }

  if (activity.type !== "NOMINATION") return base;

  const cfg = activity.config ?? {};
  const anonymous = cfg.anonymous !== false;
  const showCounts = cfg.showCounts !== false;
  const ends = cfg.timerSeconds ? new Date(activity.createdAt.getTime() + cfg.timerSeconds * 1000).toISOString() : null;
  const { tally, votes } = await nominationTally(activity.id, anonymous);
  const visible = isHost || showCounts; // host always sees; participants only when revealed
  return {
    ...base,
    nomination: {
      anonymous,
      showCounts,
      votingEndsAt: ends,
      tally: visible ? tally : [],
      tallyHidden: !visible,
      myVote: votes.find((v) => v.voterId === meId)?.nomineeId ?? null,
      totalVotes: votes.length,
    },
  };
}

// Tally per nominee (+ voter names when not anonymous). Shared by live view and log.
async function nominationTally(activityId: string, anonymous: boolean) {
  const voter = alias(users, "voter");
  const nominee = alias(users, "nominee");
  const votes = await db
    .select({ voterId: activityVotes.voterId, voterName: voter.displayName, nomineeId: activityVotes.nomineeId, nomineeName: nominee.displayName })
    .from(activityVotes)
    .innerJoin(nominee, eq(nominee.id, activityVotes.nomineeId))
    .innerJoin(voter, eq(voter.id, activityVotes.voterId))
    .where(eq(activityVotes.activityId, activityId));
  const m = new Map<string, { userId: string; name: string; count: number; voters: string[] }>();
  for (const v of votes) {
    const e = m.get(v.nomineeId) ?? { userId: v.nomineeId, name: v.nomineeName, count: 0, voters: [] };
    e.count++;
    if (!anonymous) e.voters.push(v.voterName);
    m.set(v.nomineeId, e);
  }
  return { tally: [...m.values()].sort((a, b) => b.count - a.count), votes };
}

const brainstormIdeaList = (activityId: string, meId: string) => listIdeas({ activityId }, meId);

// Tasks for the board (oldest first), with assignee + who assigned it. Shared by live view and log.
async function taskList(activityId: string) {
  const assignee = alias(users, "task_assignee");
  const creator = alias(users, "task_creator");
  const rows = await db
    .select({ id: sessionTasks.id, title: sessionTasks.title, status: sessionTasks.status, dueDate: sessionTasks.dueDate, assigneeId: sessionTasks.assigneeId, assigneeName: assignee.displayName, byName: creator.displayName })
    .from(sessionTasks)
    .leftJoin(assignee, eq(assignee.id, sessionTasks.assigneeId))
    .leftJoin(creator, eq(creator.id, sessionTasks.createdBy))
    .where(eq(sessionTasks.activityId, activityId))
    .orderBy(sessionTasks.createdAt);
  return rows.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, byName: t.byName ?? "", assignee: t.assigneeId ? { id: t.assigneeId, name: t.assigneeName ?? "" } : null }));
}

// Pre-planned (DRAFT) activities, for the Draft/Templates list.
async function draftList(sessionId: string) {
  const rows = await db
    .select({ id: activities.id, type: activities.type, title: activities.title, agendaItemId: activities.agendaItemId, config: activities.config })
    .from(activities)
    .where(and(eq(activities.sessionId, sessionId), eq(activities.state, "DRAFT")))
    .orderBy(asc(activities.createdAt));
  return rows.map((r) => ({ id: r.id, type: r.type, title: r.title, agendaItemId: r.agendaItemId, launchAt: r.config?.launchAt ?? null }));
}

async function agendaList(sessionId: string, activeId: string | null) {
  const rows = await db
    .select({ id: agendaItems.id, title: agendaItems.title, time: agendaItems.time, durationMins: agendaItems.durationMins, note: agendaItems.note, position: agendaItems.position, done: agendaItems.done })
    .from(agendaItems)
    .where(eq(agendaItems.sessionId, sessionId))
    .orderBy(asc(agendaItems.position));
  return rows.map((r) => ({ ...r, active: r.id === activeId }));
}

async function pickList(activityId: string) {
  return db
    .select({ userId: activityPicks.userId, name: users.displayName, manual: activityPicks.manual })
    .from(activityPicks)
    .innerJoin(users, eq(users.id, activityPicks.userId))
    .where(eq(activityPicks.activityId, activityId))
    .orderBy(activityPicks.createdAt);
}

// Ended activities = the session log (newest first), with detail per activity settings.
async function pastActivities(sessionId: string, meId: string) {
  const ended = await db
    .select({ id: activities.id, type: activities.type, title: activities.title, config: activities.config, endedAt: activities.endedAt, startedByName: users.displayName })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.startedBy))
    .where(and(eq(activities.sessionId, sessionId), eq(activities.state, "ENDED")))
    .orderBy(desc(activities.endedAt))
    .limit(20);
  const out = [];
  for (const a of ended) {
    const picks = await pickList(a.id);
    let nomination = undefined;
    let brainstorm = undefined;
    if (a.type === "NOMINATION") {
      const anonymous = a.config?.anonymous !== false;
      const { tally } = await nominationTally(a.id, anonymous);
      nomination = { anonymous, tally, winnerName: picks[picks.length - 1]?.name ?? null };
    }
    if (a.type === "BRAINSTORM") {
      brainstorm = { description: a.config?.description ?? null, ideas: await brainstormIdeaList(a.id, meId) };
    }
    let tasks = undefined;
    if (a.type === "TASKS" || a.type === "TASK_REVIEW") tasks = await taskList(a.id);
    let trivia = undefined;
    if (a.type === "TRIVIA") trivia = await triviaReveal(a.id);
    let poll = undefined;
    if (a.type === "POLL") poll = await pollResults(a);
    let wordcloud = undefined;
    if (a.type === "WORDCLOUD") wordcloud = await wordcloudResults(a);
    let straws = undefined;
    if (a.type === "DRAW_STRAWS") straws = await strawsResults(a.id);
    let teams = undefined;
    if (a.type === "TEAM_SELECT") teams = await teamsResults(a);
    let quiz = undefined;
    if (a.type === "QUIZ") quiz = await quizResults(a.id);
    let rps = undefined;
    if (a.type === "RPS") {
      const cfg = a.config ?? {};
      const rounds = await db.select({ winner: rpsRounds.winner, p1Forfeit: rpsRounds.p1Forfeit, p2Forfeit: rpsRounds.p2Forfeit }).from(rpsRounds).where(eq(rpsRounds.activityId, a.id));
      const p1Wins = rounds.filter((r) => r.winner === "P1").length;
      const p2Wins = rounds.filter((r) => r.winner === "P2").length;
      const p1Forfeits = rounds.filter((r) => r.p1Forfeit).length;
      const p2Forfeits = rounds.filter((r) => r.p2Forfeit).length;
      const [p1] = cfg.player1Id ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, cfg.player1Id)) : [];
      const [p2] = cfg.player2Id ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, cfg.player2Id)) : [];
      const winnerSlot = p1Forfeits >= 2 ? 2 : p2Forfeits >= 2 ? 1 : p1Wins > p2Wins ? 1 : p2Wins > p1Wins ? 2 : null;
      const byForfeit = p1Forfeits >= 2 || p2Forfeits >= 2;
      rps = {
        player1Name: p1?.name ?? "—",
        player2Name: p2?.name ?? "—",
        scores: { p1: p1Wins, p2: p2Wins },
        winnerName: winnerSlot === 1 ? p1?.name ?? null : winnerSlot === 2 ? p2?.name ?? null : null,
        loserName: winnerSlot === 1 ? p2?.name ?? null : winnerSlot === 2 ? p1?.name ?? null : null,
        byForfeit,
        agreementKind: cfg.agreementKind ?? "LOSER",
        agreementText: cfg.agreementText ?? "",
      };
    }
    out.push({ id: a.id, type: a.type, title: a.title, startedByName: a.startedByName ?? null, endedAt: a.endedAt?.toISOString() ?? null, picks, nomination, brainstorm, rps, tasks, trivia, poll, wordcloud, straws, teams, quiz });
  }
  return out;
}

async function audienceLabel(session: { scopeKind: string | null; scopeId: string | null }): Promise<string> {
  if (!session.scopeKind) return "Invite-only";
  if (session.scopeKind === "NODE" && session.scopeId) {
    const [n] = await db.select({ name: orgNodes.name }).from(orgNodes).where(eq(orgNodes.id, session.scopeId));
    return n?.name ?? "Department";
  }
  if (session.scopeKind === "GROUP" && session.scopeId) {
    const [g] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, session.scopeId));
    return g?.name ?? "Group";
  }
  return "Entire org";
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
function genCode(): string {
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

// Mark the user JOINED in this session and auto-leave any other live one they're in.
// Upserts, so it also covers join-by-code where there's no prior invite row.
async function doJoin(userId: string, sessionId: string) {
  const others = await db
    .select({ sessionId: sessionParticipants.sessionId })
    .from(sessionParticipants)
    .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
    .where(and(eq(sessionParticipants.userId, userId), eq(sessionParticipants.state, "JOINED"), eq(sessions.state, "LIVE"), ne(sessionParticipants.sessionId, sessionId)));
  for (const o of others) {
    await db.update(sessionParticipants).set({ state: "LEFT", respondedAt: new Date() }).where(and(eq(sessionParticipants.sessionId, o.sessionId), eq(sessionParticipants.userId, userId)));
    await recordEvent(o.sessionId, userId, "left");
    await notifySession(o.sessionId, { type: "session.update", sessionId: o.sessionId });
  }
  await db
    .insert(sessionParticipants)
    .values({ sessionId, userId, state: "JOINED", respondedAt: new Date() })
    .onConflictDoUpdate({ target: [sessionParticipants.sessionId, sessionParticipants.userId], set: { state: "JOINED", respondedAt: new Date(), accessRevoked: false } });
  await recordEvent(sessionId, userId, "joined");
  await notifySession(sessionId, { type: "session.update", sessionId });
}

async function recordEvent(sessionId: string, userId: string, kind: string) {
  await db.insert(sessionEvents).values({ sessionId, userId, kind });
}

async function participantEvents(sessionId: string) {
  const rows = await db
    .select({ name: users.displayName, kind: sessionEvents.kind, at: sessionEvents.at })
    .from(sessionEvents)
    .innerJoin(users, eq(users.id, sessionEvents.userId))
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(desc(sessionEvents.at))
    .limit(100);
  return rows.map((r) => ({ name: r.name, kind: r.kind, at: r.at.toISOString() }));
}

// New people a scope would invite (excludes the host and anyone already active).
async function eligibleForScope(
  session: { id: string; tenantId: string; hostId: string },
  scopeKind: "ALL" | "NODE" | "GROUP",
  scopeId: string | null,
) {
  const audience = await peopleInScope(session.tenantId, scopeKind, scopeId);
  const active = await db
    .select({ userId: sessionParticipants.userId })
    .from(sessionParticipants)
    .where(and(eq(sessionParticipants.sessionId, session.id), inArray(sessionParticipants.state, ["INVITED", "JOINED", "PENDING"])));
  const activeSet = new Set(active.map((a) => a.userId));
  return audience.filter((p) => p.id !== session.hostId && !activeSet.has(p.id));
}

async function inviteBatchList(sessionId: string) {
  const rows = await db
    .select({ id: inviteBatches.id, scopeLabel: inviteBatches.scopeLabel, count: inviteBatches.count, createdAt: inviteBatches.createdAt, cancelledAt: inviteBatches.cancelledAt, cancelReason: inviteBatches.cancelReason, byName: users.displayName })
    .from(inviteBatches)
    .leftJoin(users, eq(users.id, inviteBatches.createdBy))
    .where(eq(inviteBatches.sessionId, sessionId))
    .orderBy(desc(inviteBatches.createdAt));
  return rows.map((r) => ({
    id: r.id,
    scopeLabel: r.scopeLabel,
    count: r.count,
    byName: r.byName ?? null,
    createdAt: r.createdAt.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
  }));
}

async function hostSession(id: string, userId: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  return s && s.hostId === userId ? s : null;
}

// Host OR co-host (for invite / remove / activity control).
async function controlSession(id: string, userId: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) return null;
  return (await canControlSession(id, userId)) ? s : null;
}

async function notifySession(sessionId: string, event: RealtimeEvent) {
  const [s] = await db.select({ hostId: sessions.hostId }).from(sessions).where(eq(sessions.id, sessionId));
  const parts = await db.select({ userId: sessionParticipants.userId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  const targets = new Set(parts.map((p) => p.userId));
  if (s) targets.add(s.hostId);
  hub.sendToUsers([...targets], event);
}

async function transition(
  sessionId: string,
  userId: string,
  reply: import("fastify").FastifyReply,
  opts: { allowedFrom: string[]; to: string; liveOnly: boolean },
) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return reply.code(404).send({ error: "not_found" });
  if (opts.liveOnly && session.state !== "LIVE") return reply.code(409).send({ error: "session_not_live" });

  const [part] = await db
    .select()
    .from(sessionParticipants)
    .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId)));
  if (!part || !opts.allowedFrom.includes(part.state)) return reply.code(409).send({ error: "invalid_state" });

  await db
    .update(sessionParticipants)
    .set({ state: opts.to, respondedAt: new Date() })
    .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId)));
  if (opts.to === "LEFT") await recordEvent(sessionId, userId, "left");
  if (opts.to === "DECLINED") await recordEvent(sessionId, userId, "declined");
  await notifySession(sessionId, { type: "session.update", sessionId });
  return { ok: true };
}
