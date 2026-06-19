import { useParams, useNavigate } from "react-router-dom";
import { type BracketMatch, type TournamentDetail, type Throw, useAcceptPlayer, useJoinTournament, usePlayMatch, useRemovePlayer, useReportMatch, useStartTournament, useTournament, useWithdraw } from "../../lib/tournaments";
import { useTenantSettings } from "../../lib/tenant";
import { fmtWhen } from "../events/page";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

function roundLabel(round: number, total: number) {
  if (round === total - 1) return "Final";
  if (round === total - 2) return "Semifinals";
  if (round === total - 3) return "Quarterfinals";
  return `Round ${round + 1}`;
}

export function TournamentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: t } = useTournament(id);
  const { data: settings } = useTenantSettings();
  const report = useReportMatch(id);
  const play = usePlayMatch(id);

  if (!t) return <div className="p-2 text-sm text-muted">Loading…</div>;
  const total = t.rounds.length;

  return (
    <div className="max-w-5xl">
      <button onClick={() => navigate("/tournaments")} className="mb-2 text-sm text-muted hover:underline">← Tournaments</button>
      <PageHeader title={`🏆 ${t.title}`} subtitle={[t.gameLabel, t.scope, `${t.players.length} entrants`].filter(Boolean).join(" · ")} />

      {t.champion && (
        <Card className="mb-4 border-amber-300 bg-amber-50/50"><p className="text-sm text-fg">🏆 Champion: <span className="font-semibold">{t.champion}</span> — awarded an official big-up.</p></Card>
      )}

      {t.status === "SIGNUP" ? (
        <Signup id={id} t={t} />
      ) : (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {t.rounds.map((rnd) => (
          <div key={rnd.round} className="min-w-52 shrink-0">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">{roundLabel(rnd.round, total)}</div>
            <div className="space-y-2">
              {rnd.matches.map((m) => <MatchCard key={m.id} m={m} canManage={t.canManage} tz={settings?.timezone} onWin={(winnerId) => report.mutate({ matchId: m.id, winnerId })} onSchedule={(iso) => report.mutate({ matchId: m.id, scheduledAt: iso })} onPlay={(thr) => play.mutate({ matchId: m.id, throw: thr })} />)}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function Signup({ id, t }: { id: string; t: TournamentDetail }) {
  const join = useJoinTournament(id);
  const withdraw = useWithdraw(id);
  const start = useStartTournament(id);
  const accept = useAcceptPlayer(id);
  const remove = useRemovePlayer(id);
  const accepted = t.registrants.filter((r) => r.state === "ACCEPTED");
  const applied = t.registrants.filter((r) => r.state === "APPLIED");
  return (
    <div className="space-y-4">
      {t.requirements && <Card><p className="text-sm text-fg whitespace-pre-wrap">{t.requirements}</p></Card>}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">{t.joinPolicy === "OPEN" ? "Open to join" : "Apply to enter"} · {accepted.length} entrant{accepted.length === 1 ? "" : "s"}{applied.length ? ` · ${applied.length} pending` : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          {t.myState == null ? (
            <Button disabled={join.isPending} onClick={() => join.mutate()}>{t.joinPolicy === "OPEN" ? "Join" : "Apply"}</Button>
          ) : (
            <>
              <span className="text-xs text-emerald-600">{t.myState === "ACCEPTED" ? "✓ You're in" : "Applied — awaiting approval"}</span>
              <button onClick={() => withdraw.mutate()} className="text-xs text-muted hover:text-red-600">Withdraw</button>
            </>
          )}
          {t.canManage && <Button disabled={accepted.length < 2 || start.isPending} onClick={() => start.mutate()}>Start ({accepted.length})</Button>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-muted">Entrants</h2>
        {t.registrants.length === 0 ? <p className="text-sm text-muted">No one has joined yet.</p> : (
          <ul className="space-y-1 text-sm">
            {t.registrants.map((r) => (
              <li key={r.userId} className="flex items-center gap-2">
                <span className="flex-1 text-fg">{r.name}{r.state === "APPLIED" && <span className="ml-1 text-xs text-amber-600">(pending)</span>}</span>
                {t.canManage && r.state === "APPLIED" && <button onClick={() => accept.mutate(r.userId)} className="text-xs text-primary hover:underline">accept</button>}
                {t.canManage && <button onClick={() => remove.mutate(r.userId)} className="text-xs text-muted hover:text-red-600">remove</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const THROWS: { v: Throw; icon: string; label: string }[] = [{ v: "ROCK", icon: "✊", label: "Rock" }, { v: "PAPER", icon: "✋", label: "Paper" }, { v: "SCISSORS", icon: "✌️", label: "Scissors" }];

function MatchCard({ m, canManage, tz, onWin, onSchedule, onPlay }: { m: BracketMatch; canManage: boolean; tz?: string; onWin: (id: string) => void; onSchedule: (iso: string | null) => void; onPlay: (t: Throw) => void }) {
  const side = (name: string | null, id: string | null) => {
    const won = !!m.winnerId && m.winnerId === id;
    const lost = !!m.winnerId && m.winnerId !== id;
    return (
      <div className={`flex items-center justify-between rounded px-2 py-1 text-sm ${won ? "bg-emerald-50 font-semibold text-emerald-700" : lost ? "text-muted line-through" : "text-fg"}`}>
        <span className="min-w-0 truncate">{name ?? <span className="italic text-muted/60">TBD</span>}</span>
        {canManage && m.ready && id && <button onClick={() => onWin(id)} className="ml-2 shrink-0 text-xs text-primary hover:underline">win</button>}
      </div>
    );
  };
  return (
    <div className="rounded-lg border border-border bg-surface p-1.5">
      {side(m.p1, m.player1Id)}
      <div className="my-0.5 text-center text-[10px] text-muted/50">vs</div>
      {side(m.p2, m.player2Id)}
      {m.canPlay && (
        <div className="mt-1 border-t border-border pt-1">
          {m.myThrow ? (
            <p className="text-center text-[11px] text-muted">You threw {THROWS.find((x) => x.v === m.myThrow)?.icon} — {m.oppThrew ? "resolving…" : "waiting for opponent"}</p>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <span className="mr-1 text-[10px] text-muted">Play:</span>
              {THROWS.map((x) => <button key={x.v} onClick={() => onPlay(x.v)} title={x.label} className="rounded px-1.5 py-0.5 text-base hover:bg-border/50">{x.icon}</button>)}
            </div>
          )}
        </div>
      )}
      {(m.scheduledAt || (canManage && m.ready)) && (
        <div className="mt-1 flex items-center gap-1 border-t border-border pt-1 text-[11px] text-muted">
          {m.scheduledAt ? <span>🕒 {fmtWhen(m.scheduledAt, tz)}</span> : null}
          {canManage && m.ready && (
            <input type="datetime-local" onChange={(e) => onSchedule(e.target.value ? new Date(e.target.value).toISOString() : null)} className="ml-auto rounded border border-border bg-surface px-1 text-[11px]" title="Schedule this match" />
          )}
        </div>
      )}
    </div>
  );
}
