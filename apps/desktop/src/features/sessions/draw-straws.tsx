import { type CurrentActivity, usePickStraw } from "../../lib/sessions";
import { Card } from "../../ui/card";

// Draw straws: identical-looking straws; pick one (once) and it rises to reveal its length,
// with your name underneath. A live ranking builds up, shortest first.
export function DrawStrawsView({ sessionId, activity }: { sessionId: string; activity: CurrentActivity }) {
  const s = activity.straws;
  const pick = usePickStraw(sessionId, activity.id);
  if (!s) return null;

  const maxLen = Math.max(1, ...s.straws.map((x) => x.length ?? 0));
  const canPick = !s.iDrew && !s.done;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{activity.title || "Draw straws"}</h3>
          <p className="mt-0.5 text-sm text-muted">{s.drawnCount}/{s.total} drawn{canPick ? " · pick a straw" : s.iDrew && !s.done ? " · waiting for others" : ""}</p>
        </div>
      </div>

      {/* The lineup. Unpicked straws are identical; picked ones rise and reveal length + name. */}
      <div className="mt-4 flex items-end justify-center gap-2 rounded-lg bg-bg p-4" style={{ minHeight: 160 }}>
        {s.straws.map((straw) => {
          const revealed = straw.picked && straw.length != null;
          const heightPct = revealed ? 30 + Math.round(((straw.length! - 1) / maxLen) * 70) : 60;
          return (
            <div key={straw.idx} className="flex w-14 flex-col items-center justify-end" style={{ height: 130 }}>
              <span className="mb-1 h-4 text-xs font-semibold text-muted">{revealed ? straw.length : ""}</span>
              <button
                disabled={!canPick || straw.picked}
                onClick={() => pick.mutate(straw.idx)}
                title={canPick && !straw.picked ? "Draw this straw" : ""}
                className={`w-3 rounded-t-full transition-all duration-500 ${straw.picked ? "bg-primary" : "bg-amber-400 hover:bg-amber-500"} ${canPick && !straw.picked ? "cursor-pointer" : "cursor-default"}`}
                style={{ height: `${heightPct}%` }}
              />
              <span className="mt-1 h-4 max-w-full truncate text-[10px] text-muted">{straw.pickerName ?? ""}</span>
            </div>
          );
        })}
      </div>
      {pick.isError && <p className="mt-2 text-sm text-red-600">Couldn't draw — that straw may have just been taken.</p>}

      {s.ranking.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">Ranking — shortest first</h4>
          <ol className="space-y-0.5 text-sm">
            {s.ranking.map((r, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>{i + 1}. {r.name}{i === 0 ? " 🥢" : ""}</span>
                <span className="text-muted">{r.length}</span>
              </li>
            ))}
          </ol>
          {s.done && <p className="mt-2 text-sm text-muted">All straws drawn — <span className="font-medium text-fg">{s.ranking[0].name}</span> drew the shortest.</p>}
        </div>
      )}
    </Card>
  );
}
