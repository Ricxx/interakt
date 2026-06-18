import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "./api";

// Renders message/comment text, turning any pasted list link (/lists/<id>) into a
// permission-checked chip. Accessible → clickable title; otherwise a locked placeholder
// that never reveals the title. Plain text passes through unchanged.
const LIST_RE = /\/lists\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;

type ResolvedRef = { kind: string; id: string; title: string | null; accessible: boolean };

function listIdsIn(text: string): string[] {
  return [...new Set([...text.matchAll(LIST_RE)].map((m) => m[1]))];
}

export function RefText({ text }: { text: string }) {
  const ids = useMemo(() => listIdsIn(text), [text]);
  const { data } = useQuery({
    queryKey: ["refs", [...ids].sort()],
    queryFn: () => api<{ refs: ResolvedRef[] }>("/api/refs/resolve", { method: "POST", body: JSON.stringify({ refs: ids.map((id) => ({ kind: "list", id })) }) }),
    enabled: ids.length > 0,
  });

  if (ids.length === 0) return <>{text}</>;
  const byId = new Map((data?.refs ?? []).map((r) => [r.id, r]));

  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(LIST_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<ListChip key={key++} id={m[1]} info={byId.get(m[1])} />);
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ListChip({ id, info }: { id: string; info?: ResolvedRef }) {
  const navigate = useNavigate();
  if (info && !info.accessible) {
    return <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted" title="You don't have access">🔒 a list you can't access</span>;
  }
  return (
    <button onClick={() => navigate(`/lists/${id}`)} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:underline">
      📋 {info?.title ?? "list"}
    </button>
  );
}
