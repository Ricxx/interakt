import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Artifact = { id: string; kind: string; title: string; url: string | null; data: string | null; chartType: string | null; byName: string; mine: boolean; createdAt: string };

export function useArtifacts(sessionId: string) {
  return useQuery({ queryKey: ["artifacts", sessionId], queryFn: () => api<{ artifacts: Artifact[] }>(`/api/sessions/${sessionId}/artifacts`) });
}

export function useAddArtifact(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { url?: string; data?: string; chartType?: string; title?: string }) => api(`/api/sessions/${sessionId}/artifacts`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artifacts", sessionId] }),
  });
}

// --- DATA artifacts: parse pasted CSV/TSV and build an ECharts option ---
const PALETTE = ["#6366f1", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#a855f7", "#ec4899"];
export type Grid = { headers: string[]; rows: string[][] };

export function parseGrid(raw: string): Grid {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  const delim = (lines[0] ?? "").includes("\t") ? "\t" : ",";
  const cells = lines.map((l) => l.split(delim).map((c) => c.trim()));
  const [headers = [], ...rows] = cells;
  return { headers, rows };
}

// Column 0 = category labels; remaining numeric columns become series.
export function chartOption(grid: Grid, type: string) {
  const labels = grid.rows.map((r) => r[0] ?? "");
  const num = (v: string | undefined) => (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : 0);
  const numCols = grid.headers.map((_, i) => i).slice(1).filter((i) => grid.rows.some((r) => r[i] !== undefined && r[i] !== "" && !isNaN(Number(r[i]))));
  if (type === "DONUT") {
    const vi = numCols[0] ?? 1;
    return { color: PALETTE, tooltip: { trigger: "item" }, legend: { bottom: 0, type: "scroll" }, series: [{ type: "pie", radius: ["45%", "72%"], itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 }, data: labels.map((l, r) => ({ name: l, value: num(grid.rows[r][vi]) })) }] };
  }
  return {
    color: PALETTE,
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis" },
    legend: numCols.length > 1 ? { top: 0, type: "scroll" } : undefined,
    xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLabel: { interval: 0, overflow: "truncate", width: 80 } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#e2e8f0" } } },
    series: numCols.map((i) => ({ name: grid.headers[i], type: type === "LINE" ? "line" : "bar", smooth: type === "LINE", data: grid.rows.map((r) => num(r[i])), barMaxWidth: 48, itemStyle: type === "LINE" ? {} : { borderRadius: [4, 4, 0, 0] } })),
  };
}

export function useDeleteArtifact(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artifactId: string) => api(`/api/sessions/${sessionId}/artifacts/${artifactId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artifacts", sessionId] }),
  });
}

// youtube.com/watch?v=ID or youtu.be/ID → the embed URL, else null.
export function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}
