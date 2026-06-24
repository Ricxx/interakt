import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { scoreboards, scoreboardEntrants, scoreboardScores } from "../../db/schema.js";

// Ranked standings for a scoreboard: each entrant's total + per-game breakdown, plus the games played.
export async function standings(scoreboardId: string) {
  const entrants = await db.select().from(scoreboardEntrants).where(eq(scoreboardEntrants.scoreboardId, scoreboardId));
  const scores = await db.select().from(scoreboardScores).where(eq(scoreboardScores.scoreboardId, scoreboardId));
  const games = [...new Set(scores.map((s) => s.game).filter(Boolean))].sort();
  const rows = entrants
    .map((e) => {
      const mine = scores.filter((s) => s.entrantId === e.id);
      const perGame: Record<string, number> = {};
      for (const s of mine) perGame[s.game] = (perGame[s.game] ?? 0) + s.points;
      return { id: e.id, name: e.name, total: mine.reduce((a, s) => a + s.points, 0), perGame };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { games, standings: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
}

// Live standings for the in-session "scoreboard" activity (title + mode + standings), or null if gone.
export async function buildScoreboardActivityPayload(scoreboardId?: string) {
  if (!scoreboardId) return null;
  const [sb] = await db.select({ id: scoreboards.id, title: scoreboards.title, mode: scoreboards.mode }).from(scoreboards).where(eq(scoreboards.id, scoreboardId));
  if (!sb) return null;
  return { id: sb.id, title: sb.title, mode: sb.mode, ...(await standings(scoreboardId)) };
}
