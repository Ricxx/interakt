import ReactECharts from "echarts-for-react";
import { chartOption, type Grid } from "../../lib/artifacts";

// Lazy-loaded (echarts is heavy) — see artifacts.tsx. Renders a chart from parsed data.
export function DataChart({ grid, chartType }: { grid: Grid; chartType: string }) {
  return <ReactECharts option={chartOption(grid, chartType)} style={{ height: 260 }} notMerge />;
}
