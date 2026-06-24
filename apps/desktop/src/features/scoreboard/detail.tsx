import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { type ScoreboardDetail, useAddEntrant, useMoveWatcher, useRecordScore, useRemoveEntrant, useRemoveWatcher, useScoreboard, useScoreboardQrToken } from "../../lib/scoreboard";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const MEDAL = ["🥇", "🥈", "🥉"];

export function ScoreboardDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: s } = useScoreboard(id);
  if (!s) return <div className="p-2 text-sm text-muted">Loading…</div>;
  const noun = s.mode === "TEAM" ? "team" : "player";

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate("/scoreboards")} className="mb-2 text-sm text-muted hover:underline">← Scoreboards</button>
      <PageHeader title={`🏆 ${s.title}`} subtitle={`${s.mode === "TEAM" ? "Teams" : "Solo"} · ${s.standings.length} ${noun}${s.standings.length === 1 ? "" : "s"}${s.games.length ? ` · ${s.games.length} games` : ""}`} />

      {s.canManage && <QrButton id={id} mode={s.mode} />}

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-muted">Standings</h2>
        {s.standings.length === 0 ? (
          <p className="text-sm text-muted">No {noun}s yet{s.canManage ? " — add some below." : "."}</p>
        ) : (
          <ul className="space-y-1">
            {s.standings.map((st, i) => (
              <li key={st.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <span className="w-7 text-center text-lg">{MEDAL[i] ?? <span className="text-sm text-muted">{st.rank}</span>}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-fg">{st.name}</div>
                  {s.games.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[11px] text-muted">
                      {s.games.filter((g) => st.perGame[g]).map((g) => <span key={g} className="rounded bg-border/50 px-1.5 py-0.5">{g}: {st.perGame[g]}</span>)}
                    </div>
                  )}
                </div>
                <span className="text-lg font-bold tabular-nums text-primary">{st.total}</span>
                {s.canManage && <RemoveEntrant id={id} entrantId={st.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {s.mode === "TEAM" && (s.watchers.length > 0 || s.canManage) && <Groups id={id} s={s} />}

      {s.canManage && <Manage id={id} s={s} />}
    </div>
  );
}

function Groups({ id, s }: { id: string; s: ScoreboardDetail }) {
  const move = useMoveWatcher(id);
  const remove = useRemoveWatcher(id);
  const teams = s.standings;
  const groups = [...teams.map((t) => ({ id: t.id as string | null, name: t.name })), { id: null as string | null, name: "Unassigned" }];
  return (
    <Card className="mb-4">
      <h2 className="mb-2 text-sm font-semibold text-muted">Teams &amp; people ({s.watchers.length} joined)</h2>
      {s.watchers.length === 0 ? (
        <p className="text-sm text-muted">No one has joined a team yet — share the join QR so people can pick their team.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const people = s.watchers.filter((w) => w.entrantId === g.id);
            if (g.id === null && people.length === 0) return null;
            return (
              <div key={g.id ?? "un"} className="rounded-lg border border-border p-2">
                <div className="mb-1 text-xs font-semibold text-fg">{g.name} <span className="text-muted">({people.length})</span></div>
                {people.length === 0 ? (
                  <p className="text-xs text-muted/50">—</p>
                ) : (
                  <ul className="space-y-1">
                    {people.map((w) => (
                      <li key={w.id} className="flex items-center gap-1 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg">{w.name}</span>
                        {s.canManage && (
                          <>
                            <select value={w.entrantId ?? ""} onChange={(e) => move.mutate({ watcherId: w.id, entrantId: e.target.value || null })} className="rounded border border-border bg-surface px-1 py-0.5 text-xs" title="Move to team">
                              <option value="">Unassigned</option>
                              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <button onClick={() => remove.mutate(w.id)} className="text-muted hover:text-red-600" title="Remove">✕</button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RemoveEntrant({ id, entrantId }: { id: string; entrantId: string }) {
  const remove = useRemoveEntrant(id);
  return <button onClick={() => remove.mutate(entrantId)} className="text-xs text-muted hover:text-red-600" title="Remove">✕</button>;
}

function Manage({ id, s }: { id: string; s: ScoreboardDetail }) {
  const addEntrant = useAddEntrant(id);
  const record = useRecordScore(id);
  const [name, setName] = useState("");
  const [entrantId, setEntrantId] = useState("");
  const [game, setGame] = useState("");
  const [points, setPoints] = useState("10");

  const add = () => { if (!name.trim()) return; addEntrant.mutate(name.trim(), { onSuccess: () => setName("") }); };
  const score = () => {
    if (!entrantId || !points) return;
    record.mutate({ entrantId, game: game.trim() || undefined, points: Number(points) }, { onSuccess: () => setPoints("10") });
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">Add {s.mode === "TEAM" ? "a team" : "a player"}</h2>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder={s.mode === "TEAM" ? "Team name" : "Player name"} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <Button onClick={add} disabled={!name.trim() || addEntrant.isPending}>Add</Button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">Record points</h2>
        {s.standings.length === 0 ? (
          <p className="text-sm text-muted">Add {s.mode === "TEAM" ? "teams" : "players"} first.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={entrantId} onChange={(e) => setEntrantId(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
              <option value="">Who?</option>
              {s.standings.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <Input className="w-40" placeholder="Game (e.g. Cornhole)" value={game} onChange={(e) => setGame(e.target.value)} list="sb-games" />
            <datalist id="sb-games">{s.games.map((g) => <option key={g} value={g} />)}</datalist>
            <Input className="w-20" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
            <Button onClick={score} disabled={!entrantId || record.isPending}>Add points</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function QrButton({ id, mode }: { id: string; mode: "SOLO" | "TEAM" }) {
  const [open, setOpen] = useState(false);
  const [join, setJoin] = useState(false);
  const { data } = useScoreboardQrToken(id, open, join);
  const [qr, setQr] = useState("");
  useEffect(() => { if (data?.url) QRCode.toDataURL(data.url, { width: 220 }).then(setQr).catch(() => setQr("")); else setQr(""); }, [data?.url]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-3 text-xs text-primary hover:underline">📱 Scan QR (watch / join)</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-xs space-y-2 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-fg">{join ? "Scan to join the scoreboard" : "Scan to watch the scoreboard"}</h3>
            <p className="text-xs text-muted">On a phone on the same network — no app or login. Link expires in 12 hours.</p>
            {mode === "SOLO" && (
              <label className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} />
                Let people add themselves by name
              </label>
            )}
            <p className="text-[11px] text-muted/70">{join ? "Players scan and enter their name to compete." : "View-only — perfect for a TV / projector (can't join or be picked)."}</p>
            {qr ? <img src={qr} alt="Scoreboard QR" className="mx-auto" /> : <p className="text-sm text-muted">Generating…</p>}
            {data?.url && <p className="break-all text-[10px] text-muted/70">{data.url}</p>}
            <button onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">Close</button>
          </Card>
        </div>
      )}
    </>
  );
}
