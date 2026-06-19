import { useState } from "react";
import { type CurrentActivity, useBoardMove, useBoardRematch } from "../../lib/sessions";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

// One panel for all three 1v1 board games. The server is authoritative — we just render the
// board it sends and post moves; illegal moves are rejected server-side (the board just won't change).
export function BoardGameView({ sessionId, activity }: { sessionId: string; activity: CurrentActivity }) {
  const b = activity.board!;
  const move = useBoardMove(sessionId, activity.id);
  const rematch = useBoardRematch(sessionId, activity.id);
  const me = b.myPlayer;
  const myTurn = me != null && b.turn === me && !b.winner;
  const oppName = me === 1 ? b.player2.name : me === 2 ? b.player1.name : null;

  const status = b.winner
    ? b.winner === "TIE" ? "It's a draw." : `${(b.winner === 1 ? b.player1 : b.player2).name} wins! 🏆`
    : me == null ? `${b.player1.name} vs ${b.player2.name} — ${b.turn === 1 ? b.player1.name : b.player2.name}'s turn`
    : myTurn ? "Your turn" : `Waiting for ${oppName}…`;

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{GAME_NAME[b.game]}</h2>
        <span className="text-xs text-muted">{b.player1.name} <span className="text-red-500">●</span> vs <span className="text-slate-500">●</span> {b.player2.name}</span>
      </div>
      {b.agreementText && <p className="mb-2 text-xs text-muted">Stakes — {b.agreementKind === "WINNER" ? "winner gets" : "loser has to"}: <span className="font-medium text-fg">{b.agreementText}</span></p>}
      <p className={`mb-3 text-sm font-medium ${b.winner ? "text-primary" : myTurn ? "text-emerald-600" : "text-muted"}`}>{status}</p>

      {b.game === "TIC_TAC_TOE" && <TicTacToe b={b} myTurn={myTurn} onMove={(i) => move.mutate(i)} />}
      {b.game === "CONNECT_FOUR" && <ConnectFour b={b} myTurn={myTurn} onMove={(c) => move.mutate(c)} />}
      {b.game === "CHECKERS" && <Checkers b={b} myTurn={myTurn} onMove={(m) => move.mutate(m)} />}

      {b.winner && me != null && (
        <Button className="mt-3" onClick={() => rematch.mutate()} disabled={rematch.isPending}>Rematch</Button>
      )}
    </Card>
  );
}

const GAME_NAME = { TIC_TAC_TOE: "Tic-Tac-Toe", CONNECT_FOUR: "Connect Four", CHECKERS: "Checkers" } as const;
type B = NonNullable<CurrentActivity["board"]>;

function TicTacToe({ b, myTurn, onMove }: { b: B; myTurn: boolean; onMove: (i: number) => void }) {
  return (
    <div className="grid w-48 grid-cols-3 gap-1">
      {b.cells.map((v, i) => (
        <button
          key={i}
          onClick={() => myTurn && v === 0 && onMove(i)}
          disabled={!myTurn || v !== 0}
          className={`flex h-14 w-14 items-center justify-center rounded-lg border text-2xl font-bold ${b.lastMove === i ? "border-primary" : "border-border"} ${v === 0 && myTurn ? "hover:bg-border/40" : ""} ${v === 1 ? "text-red-500" : "text-slate-500"}`}
        >
          {v === 1 ? "✕" : v === 2 ? "◯" : ""}
        </button>
      ))}
    </div>
  );
}

function ConnectFour({ b, myTurn, onMove }: { b: B; myTurn: boolean; onMove: (col: number) => void }) {
  const colFull = (c: number) => b.cells[c] !== 0; // top row occupied
  return (
    <div className="inline-block rounded-lg bg-blue-600/80 p-2">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, c) => (
          <button key={c} onClick={() => myTurn && !colFull(c) && onMove(c)} disabled={!myTurn || colFull(c)} className="h-5 rounded text-xs text-white/80 hover:bg-white/20 disabled:opacity-30" title={`Drop in column ${c + 1}`}>▾</button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {b.cells.map((v, i) => (
          <div key={i} className={`h-8 w-8 rounded-full ${b.lastMove === i ? "ring-2 ring-white" : ""} ${v === 1 ? "bg-red-500" : v === 2 ? "bg-yellow-400" : "bg-blue-900/60"}`} />
        ))}
      </div>
    </div>
  );
}

function Checkers({ b, myTurn, onMove }: { b: B; myTurn: boolean; onMove: (m: { from: number; to: number }) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const me = b.myPlayer;
  const effSel = b.mustJumpFrom ?? sel;
  const mine = me === 1 ? [1, 3] : me === 2 ? [2, 4] : [];

  function click(idx: number) {
    if (!myTurn) return;
    const v = b.cells[idx];
    if (mine.includes(v)) { setSel(idx); return; }
    if (effSel != null && v === 0) { onMove({ from: effSel, to: idx }); setSel(null); }
  }
  return (
    <div className="inline-grid grid-cols-8 overflow-hidden rounded-lg border border-border">
      {b.cells.map((v, i) => {
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        const p1 = v === 1 || v === 3, king = v === 3 || v === 4;
        return (
          <button
            key={i}
            onClick={() => dark && click(i)}
            disabled={!dark || !myTurn}
            className={`flex h-9 w-9 items-center justify-center ${dark ? "bg-amber-800/70" : "bg-amber-100/80"} ${effSel === i ? "ring-2 ring-inset ring-emerald-400" : b.lastMove === i ? "ring-2 ring-inset ring-primary" : ""}`}
          >
            {v !== 0 && (
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${p1 ? "bg-red-500 text-red-900" : "bg-slate-700 text-slate-200"}`}>{king ? "♚" : ""}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
