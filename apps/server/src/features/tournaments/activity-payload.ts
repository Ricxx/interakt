import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { tournaments, tournamentMatches, users } from "../../db/schema.js";

// Read-only bracket for the in-session "tournament" activity — the room watches a chosen tournament's
// bracket live; the host reports results on the full Tournaments page. Null if the tournament is gone.
export async function buildTournamentActivityPayload(tournamentId?: string) {
  if (!tournamentId) return null;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t) return null;
  if (t.status === "SIGNUP" || !t.rounds) return { id: t.id, title: t.title, gameLabel: t.gameLabel, status: t.status, rounds: [], champion: null };

  const matchRows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id)).orderBy(tournamentMatches.round, tournamentMatches.slot);
  const ids = [...new Set(matchRows.flatMap((m) => [m.player1Id, m.player2Id, m.winnerId]).filter(Boolean) as string[])];
  const names = ids.length ? await db.select({ id: users.id, n: users.displayName }).from(users).where(inArray(users.id, ids)) : [];
  const nameOf = new Map(names.map((u) => [u.id, u.n] as const));
  const nm = (uid: string | null) => (uid ? nameOf.get(uid) ?? "?" : null);

  const rounds = [];
  for (let r = 0; r < t.rounds; r++) {
    rounds.push({ round: r, matches: matchRows.filter((m) => m.round === r).map((m) => ({ id: m.id, slot: m.slot, p1: nm(m.player1Id), p2: nm(m.player2Id), winner: nm(m.winnerId), winnerId: m.winnerId })) });
  }
  const final = matchRows.find((m) => m.round === t.rounds! - 1 && m.slot === 0);
  return { id: t.id, title: t.title, gameLabel: t.gameLabel, status: t.status, rounds, champion: final?.winnerId ? nm(final.winnerId) : null };
}

// Validate a tournament exists in the host's tenant (used when deploying it as a session activity).
export async function tournamentInTenant(tournamentId: string, tenantId: string) {
  const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(and(eq(tournaments.id, tournamentId), eq(tournaments.tenantId, tenantId)));
  return !!t;
}
