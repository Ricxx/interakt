// Pure rules for the 1v1 board games (tic-tac-toe, connect four, checkers). Board state lives in
// the activity's `config` jsonb — no per-game table. Everything here is server-authoritative and
// side-effect free so it's easy to test. Slot 1 = player1, slot 2 = player2.
export type BoardGame = "TIC_TAC_TOE" | "CONNECT_FOUR" | "CHECKERS";
export type Slot = 1 | 2;
export type BoardWinner = 1 | 2 | "TIE" | null;
export type Move = number | { from: number; to: number };
export type BoardState = { board: number[]; turn: Slot; winner: BoardWinner; lastMove: number | null; mustJumpFrom: number | null };

const other = (s: Slot): Slot => (s === 1 ? 2 : 1);

export function initBoard(game: BoardGame): BoardState {
  if (game === "TIC_TAC_TOE") return { board: Array(9).fill(0), turn: 1, winner: null, lastMove: null, mustJumpFrom: null };
  if (game === "CONNECT_FOUR") return { board: Array(42).fill(0), turn: 1, winner: null, lastMove: null, mustJumpFrom: null };
  // Checkers: 8×8 (index r*8+c). Dark squares only. p1 (bottom, rows 5–7) moves up; p2 (top, rows 0–2) moves down.
  const board = Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) board[r * 8 + c] = 2; else if (r > 4) board[r * 8 + c] = 1; }
  return { board, turn: 1, winner: null, lastMove: null, mustJumpFrom: null };
}

export function applyMove(game: BoardGame, s: BoardState, slot: Slot, move: Move): { state: BoardState } | { error: string } {
  if (s.winner) return { error: "game_over" };
  if (slot !== s.turn) return { error: "not_your_turn" };
  if (game === "TIC_TAC_TOE") return applyTTT(s, slot, move);
  if (game === "CONNECT_FOUR") return applyC4(s, slot, move);
  return applyCheckers(s, slot, move);
}

const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function applyTTT(s: BoardState, slot: Slot, move: Move): { state: BoardState } | { error: string } {
  if (typeof move !== "number" || move < 0 || move > 8) return { error: "illegal_move" };
  if (s.board[move] !== 0) return { error: "cell_taken" };
  const board = s.board.slice();
  board[move] = slot;
  const won = TTT_LINES.some((l) => l.every((i) => board[i] === slot));
  const full = board.every((v) => v !== 0);
  return { state: { board, turn: won || full ? s.turn : other(slot), winner: won ? slot : full ? "TIE" : null, lastMove: move, mustJumpFrom: null } };
}

function applyC4(s: BoardState, slot: Slot, move: Move): { state: BoardState } | { error: string } {
  if (typeof move !== "number" || move < 0 || move > 6) return { error: "illegal_move" };
  const board = s.board.slice();
  let idx = -1;
  for (let r = 5; r >= 0; r--) if (board[r * 7 + move] === 0) { idx = r * 7 + move; break; }
  if (idx < 0) return { error: "column_full" };
  board[idx] = slot;
  const won = c4Win(board, idx, slot);
  const full = board.every((v) => v !== 0);
  return { state: { board, turn: won || full ? s.turn : other(slot), winner: won ? slot : full ? "TIE" : null, lastMove: idx, mustJumpFrom: null } };
}
function c4Win(board: number[], idx: number, slot: Slot): boolean {
  const r = Math.floor(idx / 7), c = idx % 7;
  const run = (dr: number, dc: number) => {
    let n = 0;
    for (const sgn of [1, -1]) { let rr = r + sgn * dr, cc = c + sgn * dc; while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr * 7 + cc] === slot) { n++; rr += sgn * dr; cc += sgn * dc; } }
    return n + 1; // +1 for the placed cell
  };
  return run(0, 1) >= 4 || run(1, 0) >= 4 || run(1, 1) >= 4 || run(1, -1) >= 4;
}

// --- Checkers ---
const inB = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const ownsP = (slot: Slot) => (slot === 1 ? [1, 3] : [2, 4]);
const oppP = (slot: Slot) => (slot === 1 ? [2, 4] : [1, 3]);
const isKing = (v: number) => v === 3 || v === 4;
const stepDirs = (v: number) => (isKing(v) ? [-1, 1] : v === 1 ? [-1] : [1]); // man p1 up, man p2 down

type CMove = { from: number; to: number; cap?: number };
function checkersMoves(board: number[], slot: Slot, mustJumpFrom: number | null): { moves: CMove[]; mustCapture: boolean } {
  const own = ownsP(slot), opp = oppP(slot);
  const froms = mustJumpFrom != null ? [mustJumpFrom] : board.map((v, i) => (own.includes(v) ? i : -1)).filter((i) => i >= 0);
  const caps: CMove[] = [], simples: CMove[] = [];
  for (const from of froms) {
    const v = board[from], r = Math.floor(from / 8), c = from % 8;
    for (const dr of stepDirs(v)) for (const dc of [-1, 1]) {
      if (inB(r + dr, c + dc) && board[(r + dr) * 8 + (c + dc)] === 0) simples.push({ from, to: (r + dr) * 8 + (c + dc) });
      if (inB(r + 2 * dr, c + 2 * dc) && board[(r + 2 * dr) * 8 + (c + 2 * dc)] === 0 && opp.includes(board[(r + dr) * 8 + (c + dc)])) caps.push({ from, to: (r + 2 * dr) * 8 + (c + 2 * dc), cap: (r + dr) * 8 + (c + dc) });
    }
  }
  return caps.length ? { moves: caps, mustCapture: true } : { moves: simples, mustCapture: false };
}

function applyCheckers(s: BoardState, slot: Slot, move: Move): { state: BoardState } | { error: string } {
  if (typeof move === "number") return { error: "illegal_move" };
  const legal = checkersMoves(s.board, slot, s.mustJumpFrom);
  const chosen = legal.moves.find((m) => m.from === move.from && m.to === move.to);
  if (!chosen) return { error: "illegal_move" }; // also enforces forced-capture (only captures listed then)
  const board = s.board.slice();
  let v = board[move.from];
  board[move.from] = 0;
  if (chosen.cap != null) board[chosen.cap] = 0;
  const toRow = Math.floor(move.to / 8);
  let becameKing = false;
  if (!isKing(v) && ((slot === 1 && toRow === 0) || (slot === 2 && toRow === 7))) { v = slot === 1 ? 3 : 4; becameKing = true; }
  board[move.to] = v;

  // Mid-jump: a capturing piece that can capture again keeps the turn (unless it just kinged).
  if (chosen.cap != null && !becameKing && checkersMoves(board, slot, move.to).mustCapture) {
    return { state: { board, turn: slot, winner: null, lastMove: move.to, mustJumpFrom: move.to } };
  }
  // Turn passes; if the next player has no legal move (no pieces or all blocked), the mover wins.
  const next = other(slot);
  const winner = checkersMoves(board, next, null).moves.length === 0 ? slot : null;
  return { state: { board, turn: winner ? slot : next, winner, lastMove: move.to, mustJumpFrom: null } };
}

// Human label for the result line in the session log.
export function describeWinner(w: BoardWinner, p1: string, p2: string): string {
  if (w === "TIE") return "Draw";
  if (w === 1) return `${p1} won`;
  if (w === 2) return `${p2} won`;
  return "In progress";
}
