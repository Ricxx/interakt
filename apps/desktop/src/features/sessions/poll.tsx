import { useEffect, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { type CurrentActivity, downloadPollCsv, useActivityAction, usePollClose, usePollVote } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "../../lib/cn";

const PALETTE = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

export function PollView({ sessionId, canControl, activity }: { sessionId: string; canControl: boolean; activity: CurrentActivity }) {
  const p = activity.poll!;
  const vote = usePollVote(sessionId, activity.id);
  const close = usePollClose(sessionId, activity.id);
  const end = useActivityAction(sessionId, "end");
  const [chartType, setChartType] = useState(p.chartType);

  // Auto-close countdown (any client fires it at the deadline; idempotent).
  const [secs, setSecs] = useState(0);
  const fired = useRef(false);
  const deadlineMs = p.closeAt ? new Date(p.closeAt).getTime() : null;
  useEffect(() => {
    if (p.closed || deadlineMs === null) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [p.closed, deadlineMs]);
  useEffect(() => {
    if (!p.closed && deadlineMs !== null && secs === 0 && !fired.current) {
      fired.current = true;
      close.mutate();
    }
  }, [secs]); // eslint-disable-line react-hooks/exhaustive-deps

  const labels = p.options.map((o) => o.label);
  const counts = p.options.map((o) => o.count);
  const option =
    chartType === "DONUT"
      ? {
          color: PALETTE,
          tooltip: { trigger: "item" },
          legend: { bottom: 0, type: "scroll" },
          series: [{ type: "pie", radius: ["45%", "72%"], avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 }, label: { formatter: "{b}: {c}" }, data: labels.map((l, i) => ({ name: l, value: counts[i] })) }],
          animationDurationUpdate: 600,
        }
      : {
          color: PALETTE,
          grid: { left: 8, right: 12, top: 18, bottom: 4, containLabel: true },
          xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLabel: { interval: 0, overflow: "truncate", width: 90 } },
          yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e2e8f0" } } },
          series: [{ type: "bar", colorBy: "data", data: counts, barMaxWidth: 60, itemStyle: { borderRadius: [6, 6, 0, 0] }, label: { show: true, position: "top", formatter: "{c}" } }],
          animationDurationUpdate: 600,
          animationEasingUpdate: "cubicOut",
        };

  const voterNames = (i: number) => (p.voters ?? []).filter((v) => v.optionIndex === i).map((v) => v.name);

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Live poll{p.closed ? " · closed" : ""}</div>
          <h2 className="text-lg font-semibold">{p.question}</h2>
        </div>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      {!p.closed && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {p.options.map((o) => (
            <button
              key={o.index}
              onClick={() => vote.mutate(o.index)}
              disabled={vote.isPending}
              className={cn("rounded-lg border px-3 py-2 text-sm", p.myVote === o.index ? "border-primary bg-primary/10 font-medium text-primary" : "border-border hover:border-primary/50")}
            >
              {o.label}{p.myVote === o.index ? " ✓" : ""}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted">{deadlineMs !== null ? `closes in ${secs}s · ` : ""}{p.totalVotes} vote{p.totalVotes === 1 ? "" : "s"}</span>
        </div>
      )}
      {p.myVote !== null && !p.closed && <div className="mb-3 text-xs text-emerald-600">Voted — you can change it until it closes.</div>}

      {p.showResults ? (
        <>
          <div className="mb-2 flex items-center justify-end gap-1 text-xs">
            <button onClick={() => setChartType("BAR")} className={tab(chartType === "BAR")}>Bar</button>
            <button onClick={() => setChartType("DONUT")} className={tab(chartType === "DONUT")}>Donut</button>
          </div>
          <ReactECharts option={option} style={{ height: 280 }} notMerge />
          {/* Legend with counts + share */}
          <ul className="mt-2 space-y-1 text-sm">
            {p.options.map((o) => {
              const pct = p.totalVotes ? Math.round((o.count / p.totalVotes) * 100) : 0;
              return (
                <li key={o.index} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: PALETTE[o.index % PALETTE.length] }} />
                  <span className="flex-1">{o.label}</span>
                  <span className="text-muted">{o.count} · {pct}%</span>
                  {p.voters && voterNames(o.index).length > 0 && <span className="text-xs text-muted">({voterNames(o.index).join(", ")})</span>}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">
          {p.resultsVisibility === "AFTER_VOTE" ? "Vote to see the live results." : "Results are hidden until the host closes the poll."}
        </p>
      )}

      {canControl && (
        <div className="mt-4 flex gap-2">
          {!p.closed && <Button variant="ghost" onClick={() => close.mutate()} disabled={close.isPending}>Close voting</Button>}
          {p.canExport && <Button variant="ghost" onClick={() => downloadPollCsv(activity.id)}>Export CSV</Button>}
        </div>
      )}
    </Card>
  );
}

function tab(active: boolean): string {
  return `rounded-md px-2 py-0.5 font-medium ${active ? "bg-primary/10 text-primary" : "text-muted hover:text-fg"}`;
}
