import { useState } from "react";
import { type InviteBatch, type PastActivity, useIdeaComments } from "../../lib/sessions";
import { Card } from "../../ui/card";

const ICON: Record<string, string> = { RANDOMIZER: "🎲", NOMINATION: "🗳️", BRAINSTORM: "💡", RPS: "✊", TASKS: "✅", TASK_REVIEW: "✅", TRIVIA: "🧠", POLL: "📊" };
const TASK_STATUS: Record<string, string> = { TODO: "To do", DOING: "In progress", DONE: "Done" };

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Entry({ a }: { a: PastActivity }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start justify-between gap-2 p-3 text-left">
        <div>
          <div className="text-sm font-medium">{ICON[a.type] ?? "•"} {a.title}</div>
          <div className="text-xs text-muted">
            {a.startedByName ? `by ${a.startedByName}` : ""}{a.startedByName && a.endedAt ? " · " : ""}{when(a.endedAt)}
          </div>
        </div>
        <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2">
          {a.type === "BRAINSTORM" ? (
            <div className="space-y-2">
              {a.brainstorm?.description && <div className="text-sm text-muted">{a.brainstorm.description}</div>}
              {(a.brainstorm?.ideas.length ?? 0) === 0 && <div className="text-sm text-muted">No ideas captured.</div>}
              {[...(a.brainstorm?.ideas ?? [])].sort((x, y) => y.likes - x.likes).map((idea) => (
                <PastIdea key={idea.id} activityId={a.id} idea={idea} />
              ))}
            </div>
          ) : a.poll ? (
            <div className="text-sm">
              <div className="text-xs text-muted">{a.poll.total} vote{a.poll.total === 1 ? "" : "s"}</div>
              <ul className="mt-1 space-y-0.5">
                {a.poll.options.map((o, i) => {
                  const pct = a.poll!.total ? Math.round((o.count / a.poll!.total) * 100) : 0;
                  return (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-28 truncate">{o.label}</span>
                      <div className="h-2 flex-1 rounded bg-border/40"><div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} /></div>
                      <span className="w-12 text-right text-muted">{o.count} · {pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : a.wordcloud ? (
            <div className="text-sm">
              <div className="text-xs text-muted">{a.wordcloud.total} word{a.wordcloud.total === 1 ? "" : "s"}</div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                {a.wordcloud.words.length === 0 ? <span className="text-muted">No words.</span> : a.wordcloud.words.map((w) => <span key={w.text}>{w.text}<span className="text-muted">·{w.count}</span></span>)}
              </div>
            </div>
          ) : a.teams ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {a.teams.teams.map((tm) => (
                <div key={tm.index}>
                  <div className="font-medium">{tm.name}</div>
                  <div className="text-muted">{tm.members.map((m) => m.name).join(", ") || "—"}</div>
                </div>
              ))}
            </div>
          ) : a.straws ? (
            <div className="text-sm">
              <div className="text-xs text-muted">{a.straws.total} straws · shortest first</div>
              <ol className="mt-1 space-y-0.5 text-xs">
                {a.straws.ranking.map((r, i) => <li key={i}>{i + 1}. {r.name} <span className="text-muted">· {r.length}</span></li>)}
              </ol>
            </div>
          ) : a.trivia ? (
            <div className="space-y-1 text-sm">
              {a.trivia.map((r, i) => (
                <div key={i}>
                  <span className="font-medium">{r.authorName}</span>: <span className="text-muted">{r.prompt}</span>
                  {r.options ? (
                    <span> — <span className="font-medium">{r.correctIndex != null ? r.options[r.correctIndex] : "?"}</span></span>
                  ) : r.answer ? (
                    <span> — <span className="font-medium">{r.answer}</span></span>
                  ) : null}
                </div>
              ))}
              {a.trivia.length === 0 && <div className="text-muted">No submissions.</div>}
            </div>
          ) : a.tasks ? (
            <div className="text-sm">
              <div className="text-xs text-muted">{a.tasks.length} task{a.tasks.length === 1 ? "" : "s"} · {a.tasks.filter((t) => t.status === "DONE").length} done</div>
              <ul className="mt-1 space-y-0.5">
                {a.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className={t.status === "DONE" ? "text-muted line-through" : ""}>{t.title}</span>
                    <span className="text-muted">· {TASK_STATUS[t.status] ?? t.status}{t.assignee ? ` · ${t.assignee.name}` : ""}{t.dueDate ? ` · due ${t.dueDate}` : ""}</span>
                  </li>
                ))}
                {a.tasks.length === 0 && <li className="text-muted">No tasks added.</li>}
              </ul>
            </div>
          ) : a.rps ? (
            <div className="text-sm">
              {a.rps.winnerName ? (
                <div>
                  Winner: <span className="font-semibold">{a.rps.winnerName}</span>
                  <span className="ml-1 text-xs text-muted">beat {a.rps.loserName} · {Math.max(a.rps.scores.p1, a.rps.scores.p2)}–{Math.min(a.rps.scores.p1, a.rps.scores.p2)}{a.rps.byForfeit ? " · by forfeit (timed out)" : ""}</span>
                </div>
              ) : (
                <div className="text-muted">{a.rps.player1Name} vs {a.rps.player2Name} — {a.rps.scores.p1}–{a.rps.scores.p2} (no result)</div>
              )}
              {a.rps.agreementText && a.rps.winnerName && (
                <div className="mt-0.5 text-xs text-muted">
                  {a.rps.agreementKind === "WINNER" ? `${a.rps.winnerName} gets` : `${a.rps.loserName} has to`}: {a.rps.agreementText}
                </div>
              )}
            </div>
          ) : a.nomination ? (
            <>
              <div className="text-sm">
                Winner: <span className="font-semibold">{a.nomination.winnerName ?? "—"}</span>
                <span className="ml-1 text-xs text-muted">({a.nomination.anonymous ? "anonymous" : "named"} · {a.nomination.tally.reduce((s, t) => s + t.count, 0)} votes)</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {a.nomination.tally.map((t) => (
                  <li key={t.userId}>
                    {t.name} — {t.count} vote{t.count === 1 ? "" : "s"}
                    {!a.nomination!.anonymous && t.voters.length > 0 && <span> · {t.voters.join(", ")}</span>}
                  </li>
                ))}
                {a.nomination.tally.length === 0 && <li>— no votes —</li>}
              </ul>
            </>
          ) : (
            <ol className="space-y-0.5 text-xs text-muted">
              <li className="font-semibold text-fg">{a.picks.length} picked</li>
              {a.picks.map((p, i) => (
                <li key={p.userId + i}>
                  {i + 1}. <span className={i === a.picks.length - 1 ? "font-semibold text-fg" : ""}>{p.name}</span>
                  {p.manual ? " (chosen by host)" : ""}
                </li>
              ))}
              {a.picks.length === 0 && <li>— no picks —</li>}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// Completed activities, shown in the Activities tab — kept on screen with their final state
// (rather than vanishing on end). The Session log adds the timeline/people detail around them.
export function CompletedActivities({ past }: { past: PastActivity[] }) {
  if (past.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted">Completed activities</div>
      <div className="space-y-2">{past.map((a) => <Entry key={a.id} a={a} />)}</div>
    </div>
  );
}

// Read-only idea (for reviewing an ended brainstorm), with expandable comments.
function PastIdea({ activityId, idea }: { activityId: string; idea: { id: string; title: string; body: string | null; authorName: string; likes: number; comments: number } }) {
  const [open, setOpen] = useState(false);
  const { data } = useIdeaComments(activityId, idea.id, open);
  return (
    <div className="rounded-lg border border-border p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium">{idea.title}</span>
          {idea.body && <div className="text-muted">{idea.body}</div>}
          <div className="text-xs text-muted">by {idea.authorName}</div>
        </div>
        <div className="shrink-0 text-xs text-muted">♥ {idea.likes}</div>
      </div>
      {idea.comments > 0 && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-xs text-muted hover:text-fg">💬 {idea.comments} comment{idea.comments === 1 ? "" : "s"}</button>
      )}
      {open && (
        <div className="mt-1 space-y-0.5 border-t border-border pt-1">
          {data?.comments.map((c) => (
            <div key={c.id} className="text-xs"><span className="font-medium">{c.name}</span> <span className="text-muted">{c.body}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

type Event = { name: string; kind: string; at: string };
const EVENT_LABEL: Record<string, string> = { joined: "joined", left: "left", declined: "declined", removed: "was removed" };

export function SessionLog({ past, batches = [], events = [] }: { past: PastActivity[]; batches?: InviteBatch[]; events?: Event[] }) {
  if (past.length === 0 && batches.length === 0 && events.length === 0) {
    return <Card><p className="text-sm text-muted">Nothing logged yet. Activities, group invites, and who joined show up here.</p></Card>;
  }
  return (
    <div className="space-y-4">
      {past.length > 0 && <div className="space-y-2">{past.map((a) => <Entry key={a.id} a={a} />)}</div>}
      {events.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted">People</div>
          <ul className="space-y-0.5 text-sm text-muted">
            {events.map((e, i) => (
              <li key={i}>
                <span className="text-fg">{e.name}</span> {EVENT_LABEL[e.kind] ?? e.kind}
                <span className="ml-1 text-xs">· {when(e.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {batches.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted">Group invites</div>
          <ul className="space-y-1 text-sm">
            {batches.map((b) => (
              <li key={b.id} className={b.cancelledAt ? "text-muted line-through" : ""}>
                📨 {b.scopeLabel} — {b.count} invited{b.byName ? ` · by ${b.byName}` : ""}
                {b.cancelledAt && <span className="ml-1 no-underline">— cancelled{b.cancelReason ? `: ${b.cancelReason}` : ""}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
