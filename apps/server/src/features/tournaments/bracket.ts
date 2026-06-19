// Pure single-elimination bracket math — no DB, easy to test. Players are opaque ids (strings).
// Round 0 = first round; the final is the last round, slot 0. Byes are filled at the tail so a
// top-of-list entrant can advance for free when the field isn't a power of two.
export type Seat = string | null;
export type Match = { round: number; slot: number; p1: Seat; p2: Seat; winner: Seat };

const nextPow2 = (n: number) => (n <= 1 ? 1 : 1 << Math.ceil(Math.log2(n)));

// Build the full match list for `players` (in seed order). Byes are auto-resolved (their opponent
// advances) and propagated into round 1. Returns every match with players/winners filled so far.
export function buildBracket(players: string[]): { size: number; rounds: number; matches: Match[] } {
  const n = players.length;
  const size = Math.max(2, nextPow2(n));
  const rounds = Math.log2(size);
  const byRound: Match[][] = [];
  for (let r = 0; r < rounds; r++) {
    const count = size / 2 ** (r + 1);
    byRound[r] = Array.from({ length: count }, (_, slot) => ({ round: r, slot, p1: null as Seat, p2: null as Seat, winner: null as Seat }));
  }
  // Distribute byes one-per-match (top seeds get the free pass) so two byes never face each other.
  const byes = size - n;
  for (let m = 0; m < size / 2; m++) {
    if (m < byes) { byRound[0][m].p1 = players[m]; byRound[0][m].p2 = null; }
    else { const base = byes + 2 * (m - byes); byRound[0][m].p1 = players[base] ?? null; byRound[0][m].p2 = players[base + 1] ?? null; }
  }

  const place = (r: number, slot: number, w: Seat) => {
    byRound[r][slot].winner = w;
    if (r + 1 < rounds) { const nx = byRound[r + 1][Math.floor(slot / 2)]; if (slot % 2 === 0) nx.p1 = w; else nx.p2 = w; }
  };
  // Resolve round-0 byes (one real player vs an empty seat → that player advances).
  for (const m of byRound[0]) {
    if (m.p1 && !m.p2) place(0, m.slot, m.p1);
    else if (m.p2 && !m.p1) place(0, m.slot, m.p2);
  }
  return { size, rounds, matches: byRound.flat() };
}

// Where a winner of (round, slot) flows next. null at the final.
export function nextSlot(round: number, slot: number, rounds: number): { round: number; slot: number; which: "p1" | "p2" } | null {
  if (round + 1 >= rounds) return null;
  return { round: round + 1, slot: Math.floor(slot / 2), which: slot % 2 === 0 ? "p1" : "p2" };
}
