import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { tournaments, tournamentPlayers, tournamentMatches, recognitions, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { hasScope, isGoverned } from "../../lib/capabilities.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";
import { peopleInScope } from "../../lib/scope.js";
import { buildBracket, nextSlot } from "./bracket.js";

type Me = { id: string; tenantId: string; role: string };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function tournamentRoutes(app: FastifyInstance) {
  async function mayUseScope(me: Me, scopeKind: string) {
    if (scopeKind !== "ALL") return true;
    if (!(await isGoverned(me.id))) return true;
    return hasScope(me, "tournament.manage", "ORG");
  }
  async function loadVisible(me: Me, id: string) {
    const [t] = await db.select().from(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.tenantId, me.tenantId)));
    if (!t) return null;
    const see = t.createdBy === me.id || (await canSeeScoped({ tenantId: me.tenantId, scopeKind: t.scopeKind, scopeId: t.scopeId }, me.id, me.tenantId));
    return see ? t : "forbidden";
  }
  const canManage = (me: Me, t: { createdBy: string }) => t.createdBy === me.id || me.role === "TENANT_ADMIN";

  // Set a match's winner, advance them into the next slot, and crown the champion if it was the final.
  // Shared by organizer result-entry and the in-app Rock-Paper-Scissors settle-it.
  async function applyMatchWinner(actorId: string, t: typeof tournaments.$inferSelect, m: typeof tournamentMatches.$inferSelect, winnerId: string) {
    await db.update(tournamentMatches).set({ winnerId }).where(eq(tournamentMatches.id, m.id));
    const next = nextSlot(m.round, m.slot, t.rounds!);
    if (next) {
      const [nm2] = await db.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, t.id), eq(tournamentMatches.round, next.round), eq(tournamentMatches.slot, next.slot)));
      if (nm2) await db.update(tournamentMatches).set(next.which === "p1" ? { player1Id: winnerId } : { player2Id: winnerId }).where(eq(tournamentMatches.id, nm2.id));
    } else {
      await db.update(tournaments).set({ status: "DONE" }).where(eq(tournaments.id, t.id));
      // Champion award — a recognition the whole scope sees (and the winner is notified).
      await db.insert(recognitions).values({ tenantId: t.tenantId, fromUserId: t.createdBy, kind: "AWARD", recipientType: "USER", toUserId: winnerId, scopeKind: t.scopeKind, scopeId: t.scopeId, badge: "above-beyond", message: `🏆 Champion of ${t.title}` });
      await recordAudit({ action: "tournament.champion", tenantId: t.tenantId, actorId, meta: { id: t.id, winnerId } });
    }
  }

  // Build the bracket from a (re-)seeded player list and flip the tournament to ACTIVE.
  async function generateBracket(tenantId: string, tournamentId: string, userIds: string[], randomize: boolean) {
    const ids = randomize ? shuffle(userIds) : userIds;
    const { rounds, matches } = buildBracket(ids);
    await db.delete(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
    await db.insert(tournamentPlayers).values(ids.map((userId, seed) => ({ tournamentId, userId, seed, state: "ACCEPTED" })));
    await db.insert(tournamentMatches).values(matches.map((m) => ({ tournamentId, round: m.round, slot: m.slot, player1Id: m.p1, player2Id: m.p2, winnerId: m.winner })));
    await db.update(tournaments).set({ rounds, status: "ACTIVE" }).where(eq(tournaments.id, tournamentId));
  }

  // Create a tournament. Three modes: PICK (you choose entrants now), QUICK (auto-fill everyone in a
  // scope, randomly seeded, start immediately), or SIGNUP (open for entrants to join/apply, start later).
  app.post("/api/tournaments", { preHandler: requireAuth }, async (req, reply) => {
    const base = { title: z.string().trim().min(1).max(160), gameLabel: z.string().trim().max(60).optional(), scopeKind: z.enum(["ALL", "NODE", "GROUP"]), scopeId: z.string().uuid().nullable().optional() };
    const body = z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("PICK"), ...base, playerIds: z.array(z.string().uuid()).min(2).max(32) }),
        z.object({ mode: z.literal("QUICK"), ...base }),
        z.object({ mode: z.literal("SIGNUP"), ...base, joinPolicy: z.enum(["OPEN", "APPLY"]), requirements: z.string().max(500).optional() }),
      ])
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const d = body.data;
    if ((d.scopeKind === "NODE" || d.scopeKind === "GROUP") && !d.scopeId) return reply.code(400).send({ error: "scope_required" });
    if (!(await mayUseScope(me, d.scopeKind))) return reply.code(403).send({ error: "forbidden" });

    const [tour] = await db.insert(tournaments).values({ tenantId: me.tenantId, title: d.title.trim(), gameLabel: d.gameLabel?.trim() || null, scopeKind: d.scopeKind, scopeId: d.scopeId ?? null, status: "SIGNUP", joinPolicy: d.mode === "SIGNUP" ? d.joinPolicy : "OPEN", requirements: d.mode === "SIGNUP" ? d.requirements?.trim() || null : null, createdBy: me.id }).returning({ id: tournaments.id });

    if (d.mode === "PICK") {
      const ids = [...new Set(d.playerIds)];
      const real = await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, me.tenantId), inArray(users.id, ids)));
      if (real.length !== ids.length) { await db.delete(tournaments).where(eq(tournaments.id, tour.id)); return reply.code(400).send({ error: "unknown_player" }); }
      await generateBracket(me.tenantId, tour.id, ids, false);
    } else if (d.mode === "QUICK") {
      const people = await peopleInScope(me.tenantId, d.scopeKind, d.scopeId ?? null);
      if (people.length < 2) { await db.delete(tournaments).where(eq(tournaments.id, tour.id)); return reply.code(400).send({ error: "not_enough_people" }); }
      await generateBracket(me.tenantId, tour.id, people.map((p) => p.id), true);
    }
    if (d.scopeKind === "ALL") await recordAudit({ action: "tournament.created", tenantId: me.tenantId, actorId: me.id, meta: { id: tour.id, mode: d.mode } });
    return { id: tour.id };
  });

  app.get("/api/tournaments", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(tournaments).where(eq(tournaments.tenantId, me.tenantId)).orderBy(desc(tournaments.createdAt)).limit(100);
    const out = [];
    for (const t of rows) {
      if (t.createdBy !== me.id && !(await canSeeScoped({ tenantId: me.tenantId, scopeKind: t.scopeKind, scopeId: t.scopeId }, me.id, me.tenantId))) continue;
      out.push({ id: t.id, title: t.title, gameLabel: t.gameLabel, status: t.status, scope: await scopeLabel(me.tenantId, t.scopeKind, t.scopeId) });
    }
    return { tournaments: out };
  });

  app.get("/api/tournaments/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, id.data);
    if (!t) return reply.code(404).send({ error: "not_found" });
    if (t === "forbidden") return reply.code(403).send({ error: "forbidden" });

    const playerRows = await db.select({ userId: tournamentPlayers.userId, seed: tournamentPlayers.seed, state: tournamentPlayers.state, name: users.displayName }).from(tournamentPlayers).innerJoin(users, eq(users.id, tournamentPlayers.userId)).where(eq(tournamentPlayers.tournamentId, t.id));
    const myReg = playerRows.find((p) => p.userId === me.id);
    const base = {
      id: t.id, title: t.title, gameLabel: t.gameLabel, status: t.status, joinPolicy: t.joinPolicy, requirements: t.requirements,
      scope: await scopeLabel(me.tenantId, t.scopeKind, t.scopeId), canManage: canManage(me, t), myState: myReg?.state ?? null,
      registrants: playerRows.sort((a, b) => a.seed - b.seed).map((p) => ({ userId: p.userId, name: p.name, state: p.state })),
      rounds: [] as unknown[], champion: null as string | null, players: [] as { seed: number; name: string | null }[],
    };
    if (t.status === "SIGNUP" || !t.rounds) return base;

    const matchRows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id)).orderBy(tournamentMatches.round, tournamentMatches.slot);
    const ids = [...new Set(matchRows.flatMap((m) => [m.player1Id, m.player2Id, m.winnerId]).filter(Boolean) as string[])];
    const nameById = new Map([...playerRows.map((p) => [p.userId, p.name] as const), ...(ids.length ? (await db.select({ id: users.id, n: users.displayName }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.n] as const) : [])]);
    const nm = (uid: string | null) => (uid ? nameById.get(uid) ?? "?" : null);
    const rounds = [];
    for (let r = 0; r < t.rounds; r++) rounds.push({ round: r, matches: matchRows.filter((m) => m.round === r).map((m) => {
      const ready = !!m.player1Id && !!m.player2Id && !m.winnerId;
      const iAmIn = m.player1Id === me.id || m.player2Id === me.id;
      const myThrow = m.player1Id === me.id ? m.p1Throw : m.player2Id === me.id ? m.p2Throw : null;
      const oppThrew = m.player1Id === me.id ? !!m.p2Throw : m.player2Id === me.id ? !!m.p1Throw : false; // boolean only — never reveal what
      return { id: m.id, slot: m.slot, p1: nm(m.player1Id), p2: nm(m.player2Id), winner: nm(m.winnerId), winnerId: m.winnerId, player1Id: m.player1Id, player2Id: m.player2Id, ready, scheduledAt: m.scheduledAt?.toISOString() ?? null, canPlay: ready && iAmIn, myThrow, oppThrew };
    }) });
    const final = matchRows.find((m) => m.round === t.rounds! - 1 && m.slot === 0);
    return { ...base, rounds, champion: final?.winnerId ? nm(final.winnerId) : null, players: base.registrants.map((p) => ({ seed: 0, name: p.name })) };
  });

  // Entrant self-service during signup.
  app.post("/api/tournaments/:id/join", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, id.data);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (t.status !== "SIGNUP") return reply.code(409).send({ error: "not_open" });
    const [existing] = await db.select({ id: tournamentPlayers.id }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, me.id)));
    if (existing) return { ok: true };
    const state = t.joinPolicy === "OPEN" ? "ACCEPTED" : "APPLIED";
    await db.insert(tournamentPlayers).values({ tournamentId: t.id, userId: me.id, seed: 0, state });
    return { state };
  });
  app.delete("/api/tournaments/:id/join", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, id.data);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (t.status !== "SIGNUP") return reply.code(409).send({ error: "already_started" }); // can't back out once seeded
    await db.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, me.id)));
    return { ok: true };
  });

  // Organizer: accept an applicant / remove an entrant, and start (seed the bracket).
  app.post<{ Params: { id: string; userId: string } }>("/api/tournaments/:id/players/:userId/accept", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, req.params.id);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (!canManage(me, t)) return reply.code(403).send({ error: "forbidden" });
    await db.update(tournamentPlayers).set({ state: "ACCEPTED" }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, req.params.userId)));
    return { ok: true };
  });
  app.delete<{ Params: { id: string; userId: string } }>("/api/tournaments/:id/players/:userId", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, req.params.id);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (!canManage(me, t) || t.status !== "SIGNUP") return reply.code(403).send({ error: "forbidden" });
    await db.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, req.params.userId)));
    return { ok: true };
  });
  app.post("/api/tournaments/:id/start", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, id.data);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (!canManage(me, t)) return reply.code(403).send({ error: "forbidden" });
    if (t.status !== "SIGNUP") return reply.code(409).send({ error: "already_started" });
    const accepted = (await db.select({ userId: tournamentPlayers.userId }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.state, "ACCEPTED")))).map((p) => p.userId);
    if (accepted.length < 2) return reply.code(400).send({ error: "need_two_players" });
    await generateBracket(me.tenantId, t.id, accepted, true); // random seeding
    return { ok: true };
  });

  // Report a result / schedule a match. Deciding the final crowns a champion (+ an official award).
  app.patch("/api/tournaments/:id/matches/:matchId", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const matchId = z.string().uuid().safeParse((req.params as { matchId: string }).matchId);
    const body = z.object({ winnerId: z.string().uuid().optional(), scheduledAt: z.string().datetime().nullable().optional() }).safeParse(req.body);
    if (!id.success || !matchId.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, id.data);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (!canManage(me, t) || !t.rounds) return reply.code(403).send({ error: "forbidden" });
    const [m] = await db.select().from(tournamentMatches).where(and(eq(tournamentMatches.id, matchId.data), eq(tournamentMatches.tournamentId, t.id)));
    if (!m) return reply.code(404).send({ error: "not_found" });

    if (body.data.scheduledAt !== undefined) await db.update(tournamentMatches).set({ scheduledAt: body.data.scheduledAt ? new Date(body.data.scheduledAt) : null }).where(eq(tournamentMatches.id, m.id));
    if (body.data.winnerId !== undefined) {
      const w = body.data.winnerId;
      if (w !== m.player1Id && w !== m.player2Id) return reply.code(400).send({ error: "winner_not_in_match" });
      if (m.winnerId) return reply.code(409).send({ error: "already_decided" });
      await applyMatchWinner(me.id, t, m, w);
    }
    return { ok: true };
  });

  // A player in the match settles it with Rock-Paper-Scissors. Both throw blind; when both are in we
  // compute the winner and advance (a tie clears both throws for a replay). Players only — not the organizer.
  app.post("/api/tournaments/:id/matches/:matchId/play", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const matchId = z.string().uuid().safeParse((req.params as { matchId: string }).matchId);
    const body = z.object({ throw: z.enum(["ROCK", "PAPER", "SCISSORS"]) }).safeParse(req.body);
    if (!id.success || !matchId.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const t = await loadVisible(me, id.data);
    if (!t || t === "forbidden") return reply.code(t === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (!t.rounds) return reply.code(409).send({ error: "not_started" });
    const [m] = await db.select().from(tournamentMatches).where(and(eq(tournamentMatches.id, matchId.data), eq(tournamentMatches.tournamentId, t.id)));
    if (!m) return reply.code(404).send({ error: "not_found" });
    const slot = m.player1Id === me.id ? "p1" : m.player2Id === me.id ? "p2" : null;
    if (!slot) return reply.code(403).send({ error: "not_your_match" });
    if (m.winnerId) return reply.code(409).send({ error: "already_decided" });
    if (!m.player1Id || !m.player2Id) return reply.code(409).send({ error: "not_ready" });

    const myThrow = body.data.throw;
    const oppThrow = slot === "p1" ? m.p2Throw : m.p1Throw; // you can re-pick until your opponent has thrown
    await db.update(tournamentMatches).set(slot === "p1" ? { p1Throw: myThrow } : { p2Throw: myThrow }).where(eq(tournamentMatches.id, m.id));
    if (!oppThrow) return { status: "waiting" };

    const beats: Record<string, string> = { ROCK: "SCISSORS", PAPER: "ROCK", SCISSORS: "PAPER" };
    const p1Throw = slot === "p1" ? myThrow : oppThrow;
    const p2Throw = slot === "p2" ? myThrow : oppThrow;
    if (p1Throw === p2Throw) {
      await db.update(tournamentMatches).set({ p1Throw: null, p2Throw: null }).where(eq(tournamentMatches.id, m.id)); // tie → replay
      return { status: "tie" };
    }
    const winnerId = beats[p1Throw] === p2Throw ? m.player1Id : m.player2Id;
    await applyMatchWinner(me.id, t, m, winnerId);
    return { status: "decided", winnerId };
  });
}
