import { lazy, Suspense, useState } from "react";
import { type Artifact, parseGrid, useAddArtifact, useArtifacts, useDeleteArtifact, youtubeEmbed } from "../../lib/artifacts";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const DataChart = lazy(() => import("./data-chart").then((m) => ({ default: m.DataChart })));
const CHART_TYPES = ["BAR", "LINE", "DONUT"];

// Resources tab: links / images / videos / quick data charts anyone in the room can drop
// and everyone opens instantly — no screen-share. URL- and paste-based for now.
export function Artifacts({ sessionId }: { sessionId: string }) {
  const { data } = useArtifacts(sessionId);
  const add = useAddArtifact(sessionId);
  const del = useDeleteArtifact(sessionId);
  const [mode, setMode] = useState<"link" | "chart">("link");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [chartType, setChartType] = useState("BAR");

  function reset() { setUrl(""); setTitle(""); setRaw(""); }
  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https?:\/\//i.test(url.trim())) return;
    add.mutate({ url: url.trim(), title: title.trim() || undefined }, { onSuccess: reset });
  }
  function submitChart(e: React.FormEvent) {
    e.preventDefault();
    if (!raw.trim() || !title.trim()) return;
    add.mutate({ data: raw, chartType, title: title.trim() }, { onSuccess: reset });
  }

  const artifacts = data?.artifacts ?? [];
  const tab = (key: typeof mode, label: string) => (
    <button type="button" onClick={() => setMode(key)} className={cn("rounded-md px-2 py-1 text-xs font-medium", mode === key ? "bg-primary/10 text-primary" : "text-muted hover:text-fg")}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-muted">Add a resource</h3>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-bg p-0.5">{tab("link", "Link")}{tab("chart", "Chart")}</div>
        </div>
        {mode === "link" ? (
          <form onSubmit={submitLink} className="flex flex-wrap items-center gap-2">
            <Input placeholder="Paste a link, image, or YouTube URL…" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-56 flex-1" />
            <Input placeholder="Label (optional)" value={title} onChange={(e) => setTitle(e.target.value)} className="w-40" />
            <Button type="submit" disabled={add.isPending || !/^https?:\/\//i.test(url.trim())}>Add</Button>
          </form>
        ) : (
          <form onSubmit={submitChart} className="space-y-2">
            <Input placeholder="Chart title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              placeholder={"Paste data (CSV or tab-separated). First row = headers, first column = labels:\n\nQuarter,Sales,Costs\nQ1,120,80\nQ2,150,90"}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <select value={chartType} onChange={(e) => setChartType(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                {CHART_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
              <Button type="submit" disabled={add.isPending || !raw.trim() || !title.trim()}>Add chart</Button>
            </div>
          </form>
        )}
        {add.isError && <p className="mt-2 text-sm text-red-600">Couldn't add — check the URL or data.</p>}
      </Card>

      {artifacts.length === 0 ? (
        <Card><p className="text-sm text-muted">No resources yet. Drop a link, image, video, or a quick data chart above — everyone in the room sees it instantly.</p></Card>
      ) : (
        <div className="space-y-3">
          {artifacts.map((a) => <ArtifactCard key={a.id} a={a} onDelete={() => del.mutate(a.id)} />)}
        </div>
      )}
    </div>
  );
}

function ArtifactCard({ a, onDelete }: { a: Artifact; onDelete: () => void }) {
  const embed = a.kind === "VIDEO" && a.url ? youtubeEmbed(a.url) : null;
  const grid = a.kind === "DATA" && a.data ? parseGrid(a.data) : null;
  const icon = a.kind === "IMAGE" ? "🖼️" : a.kind === "VIDEO" ? "🎬" : a.kind === "DATA" ? "📊" : "🔗";
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        {a.url ? (
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{icon} {a.title}</a>
        ) : (
          <span className="font-medium">{icon} {a.title}</span>
        )}
        {a.mine && <button onClick={onDelete} className="shrink-0 text-muted hover:text-red-600" title="Remove">×</button>}
      </div>
      <div className="mt-1 text-xs text-muted">added by {a.byName}</div>
      {a.kind === "IMAGE" && a.url && <img src={a.url} alt={a.title} className="mt-3 max-h-80 rounded-lg border border-border" />}
      {embed && (
        <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg border border-border">
          <iframe src={embed} title={a.title} className="h-full w-full" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}
      {grid && (
        <div className="mt-3 space-y-3">
          <Suspense fallback={<p className="text-sm text-muted">Loading chart…</p>}><DataChart grid={grid} chartType={a.chartType ?? "BAR"} /></Suspense>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr>{grid.headers.map((h, i) => <th key={i} className="pb-1 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {grid.rows.map((r, ri) => <tr key={ri} className="border-t border-border">{r.map((c, ci) => <td key={ci} className="py-1 pr-3">{c}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
