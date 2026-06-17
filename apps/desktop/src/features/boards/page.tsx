import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useBoards, useCreateBoard } from "../../lib/boards";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

type OrgNode = { id: string; name: string; path: string };

export function BoardsPage() {
  const navigate = useNavigate();
  const { data } = useBoards();
  const create = useCreateBoard();
  const { data: orgData } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const { data: groupData } = useQuery({ queryKey: ["groups"], queryFn: () => api<{ groups: { id: string; name: string }[] }>("/api/groups") });

  const [type, setType] = useState("NOTICE");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [scope, setScope] = useState("all");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const [scopeKind, scopeId] = scope === "all" ? ["ALL", null] : scope.startsWith("g:") ? ["GROUP", scope.slice(2)] : ["NODE", scope];
    create.mutate(
      { type, title: title.trim(), description: desc.trim() || undefined, scopeKind, scopeId },
      { onSuccess: (r) => navigate(`/boards/${r.board.id}`) },
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Boards" subtitle="Ongoing idea boards — add and revisit ideas anytime, no live session needed." />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">New board</h2>
        <form onSubmit={submit} className="space-y-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="NOTICE">📌 Notice board</option>
            <option value="BRAINSTORM">💡 Brainstorm board</option>
          </select>
          <Input placeholder="Board title (e.g. Team Notices)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex gap-2">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <option value="all">Org-wide</option>
              <optgroup label="Departments">
                {orgData?.nodes.filter((n) => n.path !== "org").map((n) => (
                  <option key={n.id} value={n.id}>{"  ".repeat(n.path.split(".").length - 1)}{n.name}</option>
                ))}
              </optgroup>
              {groupData && groupData.groups.length > 0 && (
                <optgroup label="Custom groups">
                  {groupData.groups.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}
                </optgroup>
              )}
            </select>
            <Button type="submit" disabled={!title.trim() || create.isPending}>Create</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Boards</h2>
        <ul className="space-y-1">
          {(data?.boards ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between text-sm">
              <span>
                {b.type === "NOTICE" ? "📌" : "💡"} {b.title}
                <span className="text-xs text-muted"> · {b.scope} · {b.items} {b.type === "NOTICE" ? "notice" : "idea"}{b.items === 1 ? "" : "s"}</span>
              </span>
              <button onClick={() => navigate(`/boards/${b.id}`)} className="text-xs text-primary hover:underline">Open</button>
            </li>
          ))}
          {data && data.boards.length === 0 && <li className="text-sm text-muted">No boards yet. Create one above.</li>}
        </ul>
      </Card>
    </div>
  );
}
