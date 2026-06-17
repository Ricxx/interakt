import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

type OrgNode = { id: string; name: string; nodeType: string; path: string; parentId: string | null };
const TYPES = ["DIVISION", "DEPARTMENT", "UNIT", "TEAM"];

function useOrgMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org-nodes"] });
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["pool"] });
  };
  return {
    create: useMutation({
      mutationFn: (b: { name: string; nodeType: string; parentId: string | null }) =>
        api("/api/org/nodes", { method: "POST", body: JSON.stringify(b) }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/api/org/nodes/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    loadDemo: useMutation({
      mutationFn: () => api("/api/org/demo", { method: "POST" }),
      onSuccess: invalidate,
    }),
  };
}

export function OrgStructurePage() {
  const { data } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const m = useOrgMutations();
  const [name, setName] = useState("");
  const [nodeType, setNodeType] = useState("DIVISION");
  const [parentId, setParentId] = useState("");

  const nodes = data?.nodes ?? [];

  // Org → Division → Department → Team/Unit. Suggest the right child type for a parent.
  function suggestType(parentType: string | undefined): string {
    if (!parentType) return "DIVISION";
    if (parentType === "DIVISION") return "DEPARTMENT";
    if (parentType === "DEPARTMENT") return "TEAM";
    return "UNIT";
  }
  function onParentChange(pid: string) {
    setParentId(pid);
    setNodeType(suggestType(nodes.find((n) => n.id === pid)?.nodeType));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    m.create.mutate({ name: name.trim(), nodeType, parentId: parentId || null }, { onSuccess: () => setName("") });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Org structure" subtitle="Build your divisions, departments, and teams." />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Add a node</h2>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input placeholder="Name (e.g. Marketing)" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-44" />
          <select value={nodeType} onChange={(e) => setNodeType(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={parentId} onChange={(e) => onParentChange(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Top level (Division)</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {"  ".repeat(n.path.split(".").length - 1)}{n.name}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={m.create.isPending}>Add</Button>
        </form>
        {m.create.isError && <p className="mt-2 text-sm text-red-600">Could not add — check the parent.</p>}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Hierarchy</h2>
          {nodes.length === 0 && (
            <button onClick={() => m.loadDemo.mutate()} disabled={m.loadDemo.isPending} className="text-xs text-primary hover:underline">
              Load demo data
            </button>
          )}
        </div>
        {nodes.length === 0 ? (
          <p className="text-sm text-muted">No structure yet. Add a division above, or load demo data to explore.</p>
        ) : (
          <ul className="space-y-1">
            {nodes.map((n) => {
              const depth = n.path.split(".").length - 1;
              return (
                <li key={n.id} className="flex items-center justify-between rounded px-2 py-1.5 text-sm" style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}>
                  <span className="flex items-center gap-2">
                    <span>{n.name}</span>
                    <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{n.nodeType}</span>
                  </span>
                  <button onClick={() => m.remove.mutate(n.id)} className="text-xs text-red-600 hover:underline">
                    delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {m.remove.isError && <p className="mt-2 text-sm text-red-600">Can't delete — it has child nodes or people assigned.</p>}
      </Card>
    </div>
  );
}
