import { useEffect, useRef, useState } from "react";
import { type CurrentActivity, type RpsRound, useActivityAction, useRpsPick, useRpsTimeout } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

const CHOICES = ["ROCK", "PAPER", "SCISSORS"];
const EMOJI: Record<string, string> = { ROCK: "🪨", PAPER: "📄", SCISSORS: "✂️" };
const LABEL: Record<string, string> = { ROCK: "Rock", PAPER: "Paper", SCISSORS: "Scissors" };

// Per-round reveal sequence overlay (the one-time intro is tracked separately via introDone).
type Anim = { kind: "reveal"; round: RpsRound; step: "chant" | "flip" | "hold" } | null;

export function RpsView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const rps = activity.rps!;
  const pick = useRpsPick(sessionId, activity.id);
  const timeout = useRpsTimeout(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const cur = rps.currentRound;
  const iAmPlayer = rps.myPlayer !== null;
  const over = rps.matchWinner !== null;
  const newest = rps.rounds[rps.rounds.length - 1] ?? null;

  const [anim, setAnim] = useState<Anim>(null);
  const [pending, setPending] = useState<string | null>(null); // my selected-but-not-locked choice
  const [secs, setSecs] = useState(30);
  // Captured once at mount (state initializers, not refs mutated in effects — StrictMode-safe):
  // play the intro only for a fresh match, and skip reveals for rounds finished before we opened.
  const [introDone, setIntroDone] = useState(() => !(rps.rounds.length === 0 && cur?.roundNo === 1));
  const [seenAtMount] = useState(newest?.roundNo ?? 0);
  const firedTimeout = useRef<number | null>(null);

  // One-time 3-2-1 intro at the very start of the match.
  useEffect(() => {
    if (introDone) return;
    const t = setTimeout(() => setIntroDone(true), 2700);
    return () => clearTimeout(t);
  }, [introDone]);

  // When a new round finishes, play the reveal: chant → flip cards → hold 5s on the winner.
  useEffect(() => {
    if (!newest || newest.roundNo <= seenAtMount) return;
    setPending(null);
    setAnim({ kind: "reveal", round: newest, step: "chant" });
    const toFlip = setTimeout(() => setAnim((a) => (a?.kind === "reveal" ? { ...a, step: "flip" } : a)), 1400);
    const toHold = setTimeout(() => setAnim((a) => (a?.kind === "reveal" ? { ...a, step: "hold" } : a)), 2100);
    const toEnd = setTimeout(() => setAnim(null), 2100 + 5000);
    return () => { clearTimeout(toFlip); clearTimeout(toHold); clearTimeout(toEnd); };
  }, [newest?.roundNo, seenAtMount]); // eslint-disable-line react-hooks/exhaustive-deps

  const showIntro = !introDone;
  const inSelection = introDone && anim === null && !!cur && !over;
  const deadlineMs = cur?.deadline ? new Date(cur.deadline).getTime() : null;

  // Countdown to the server's lock-in deadline (shared by both clients), ticking every 250ms.
  useEffect(() => {
    if (!inSelection || deadlineMs === null) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [cur?.roundNo, inSelection, deadlineMs]);

  // At the deadline, ask the server to resolve: whoever didn't lock in forfeits the round.
  // Either client may fire it (idempotent), so a disconnected opponent still gets forfeited.
  useEffect(() => {
    if (secs === 0 && inSelection && cur && firedTimeout.current !== cur.roundNo) {
      firedTimeout.current = cur.roundNo;
      timeout.mutate();
    }
  }, [secs]); // eslint-disable-line react-hooks/exhaustive-deps

  const winnerName = rps.matchWinner === 1 ? rps.player1.name : rps.matchWinner === 2 ? rps.player2.name : "";
  const loserName = rps.matchWinner === 1 ? rps.player2.name : rps.matchWinner === 2 ? rps.player1.name : "";

  return (
    // Players get a tinted ring so they notice it's their turn even if not watching closely.
    <Card className={cn(iAmPlayer && !over && "ring-2 ring-primary/60")}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Rock Paper Scissors · best of {rps.bestOf}</div>
          {rps.agreementText && (
            <div className="text-sm font-medium">{rps.agreementKind === "WINNER" ? "Winner gets" : "Loser has to"}: {rps.agreementText}</div>
          )}
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {/* Scoreboard */}
      <div className="mb-4 flex items-stretch justify-center gap-3 text-center">
        <PlayerScore name={rps.player1.name} score={rps.scores.p1} you={rps.myPlayer === 1} state={over ? (rps.matchWinner === 1 ? "win" : "lose") : "none"} />
        <div className="flex items-center text-muted">vs</div>
        <PlayerScore name={rps.player2.name} score={rps.scores.p2} you={rps.myPlayer === 2} state={over ? (rps.matchWinner === 2 ? "win" : "lose") : "none"} />
      </div>

      {showIntro ? (
        <Intro />
      ) : anim?.kind === "reveal" ? (
        <Reveal anim={anim} p1={rps.player1.name} p2={rps.player2.name} />
      ) : over ? (
        <div className="mb-4 rounded-lg border-2 border-emerald-500/60 bg-emerald-500/10 p-5 text-center" style={{ animation: "ces-pop 0.4s ease-out" }}>
          <div className="text-2xl font-bold">🏆 {winnerName} wins!</div>
          {rps.endedReason && <div className="mt-1 text-sm font-medium text-red-500">{rps.endedReason}</div>}
          {rps.agreementText && <div className="mt-1 text-sm text-muted">{rps.agreementKind === "WINNER" ? `${winnerName} gets` : `${loserName} has to`}: {rps.agreementText}</div>}
        </div>
      ) : cur ? (
        <div className="mb-4 text-center">
          <div className="mb-2 text-sm text-muted">Round {cur.roundNo} · {secs}s to lock in</div>
          {iAmPlayer && !cur.myLocked ? (
            <div className="space-y-3">
              <div className="flex justify-center gap-3">
                {CHOICES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPending(c)}
                    disabled={pick.isPending}
                    className={cn(
                      "flex flex-col items-center rounded-lg border px-5 py-3 transition-colors",
                      pending === c ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                    )}
                  >
                    <span className="text-3xl">{EMOJI[c]}</span>
                    <span className="mt-1 text-xs text-muted">{LABEL[c]}</span>
                  </button>
                ))}
              </div>
              <Button onClick={() => pending && pick.mutate(pending)} disabled={!pending || pick.isPending}>
                {pending ? `Lock in ${LABEL[pending]}` : "Pick one, then lock in"}
              </Button>
            </div>
          ) : iAmPlayer ? (
            <div className="text-sm">You locked in {pending ? EMOJI[pending] : "✓"} — waiting for your opponent…</div>
          ) : (
            <div className="text-sm text-muted">{rps.player1.name} {cur.p1Locked ? "✓" : "…"} · {rps.player2.name} {cur.p2Locked ? "✓" : "…"}</div>
          )}
        </div>
      ) : null}

      {/* Completed rounds */}
      {rps.rounds.length > 0 && (
        <ol className="space-y-1 text-sm">
          {rps.rounds.map((r) => (
            <li key={r.roundNo} className={cn("flex items-center gap-2", r === newest ? "font-semibold" : "text-muted")}>
              <span className="text-muted">R{r.roundNo}:</span>
              <span className="text-lg">{r.p1Forfeit ? "⏱️" : r.p1Choice ? EMOJI[r.p1Choice] : "?"}</span>
              <span className="text-xs">vs</span>
              <span className="text-lg">{r.p2Forfeit ? "⏱️" : r.p2Choice ? EMOJI[r.p2Choice] : "?"}</span>
              <span className="ml-1 text-xs">→ {r.winner === "TIE" ? "tie" : r.winner === "P1" ? rps.player1.name : rps.player2.name}{(r.p1Forfeit || r.p2Forfeit) ? " (forfeit)" : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function PlayerScore({ name, score, you, state }: { name: string; score: number; you: boolean; state: "win" | "lose" | "none" }) {
  return (
    <div className={cn(
      "flex-1 rounded-lg border-2 p-2",
      state === "win" ? "border-emerald-500/60 bg-emerald-500/10" : state === "lose" ? "border-red-500/50 bg-red-500/10" : "border-transparent",
    )}>
      <div className="font-semibold">{name}{you && <span className="ml-1 text-xs text-primary">(you)</span>}</div>
      <div className="text-2xl">{score}</div>
    </div>
  );
}

function Intro() {
  // 3 … 2 … 1 …, each number popping in turn.
  const [n, setN] = useState(3);
  useEffect(() => {
    const t1 = setTimeout(() => setN(2), 800);
    const t2 = setTimeout(() => setN(1), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className="mb-4 flex min-h-32 items-center justify-center rounded-lg bg-bg">
      <div key={n} className="text-6xl font-bold text-primary" style={{ animation: "ces-pop 0.4s ease-out" }}>{n}</div>
    </div>
  );
}

function Reveal({ anim, p1, p2 }: { anim: { round: RpsRound; step: "chant" | "flip" | "hold" }; p1: string; p2: string }) {
  const { round, step } = anim;
  const flipped = step === "flip" || step === "hold";
  const w = round.winner; // P1 | P2 | TIE
  return (
    <div className="mb-4 rounded-lg bg-bg p-5">
      {step === "chant" ? (
        <div className="text-center text-2xl font-bold tracking-wide" style={{ animation: "ces-pop 0.4s ease-out" }}>Rock… Paper… Scissors!</div>
      ) : (
        <div className="flex items-center justify-center gap-6">
          <FlipCard choice={round.p1Choice} forfeit={round.p1Forfeit} flipped={flipped} name={p1} outcome={step === "hold" ? (w === "P1" ? "win" : w === "P2" ? "lose" : "tie") : "none"} />
          <div className="text-sm text-muted">vs</div>
          <FlipCard choice={round.p2Choice} forfeit={round.p2Forfeit} flipped={flipped} name={p2} outcome={step === "hold" ? (w === "P2" ? "win" : w === "P1" ? "lose" : "tie") : "none"} />
        </div>
      )}
      {step === "hold" && (
        <div className="mt-3 text-center text-sm font-semibold" style={{ animation: "ces-pop 0.4s ease-out" }}>
          {round.p1Forfeit || round.p2Forfeit
            ? `${round.p1Forfeit && round.p2Forfeit ? "Both timed out" : `${round.p1Forfeit ? p1 : p2} timed out`} — ${w === "TIE" ? "replay!" : `round ${round.roundNo} to ${w === "P1" ? p1 : p2}`}`
            : w === "TIE" ? "Tie — replay!" : `${w === "P1" ? p1 : p2} takes round ${round.roundNo}`}
        </div>
      )}
    </div>
  );
}

function FlipCard({ choice, forfeit, flipped, name, outcome }: { choice: string | null; forfeit: boolean; flipped: boolean; name: string; outcome: "win" | "lose" | "tie" | "none" }) {
  return (
    <div className="text-center">
      <div className="rps-card mx-auto h-20 w-20">
        <div className={cn("rps-card-inner", flipped && "flipped")}>
          <div className="rps-face border-2 border-border bg-surface text-3xl">❓</div>
          <div className={cn(
            "rps-face rps-face-back border-2 text-4xl",
            outcome === "win" ? "border-emerald-500/60 bg-emerald-500/10" : outcome === "lose" ? "border-red-500/50 bg-red-500/10" : "border-border bg-surface",
          )}>
            {forfeit ? "⏱️" : choice ? EMOJI[choice] : "?"}
          </div>
        </div>
      </div>
      <div className="mt-1 text-xs text-muted">{name}</div>
    </div>
  );
}
