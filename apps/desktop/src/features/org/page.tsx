import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { timeAgo } from "../../lib/tasks";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

type OrgNode = { id: string; name: string; nodeType: string; path: string; parentId: string | null; memberCount: number };
type LogEntry = { action: string; meta: { name?: string; nodeType?: string } | null; actorName: string | null; createdAt: string };
// Just suggestions — the level label is free-form, so any org structure/naming works.
const TYPE_SUGGESTIONS = ["Division", "Department", "Team", "Unit", "Region", "Branch", "Squad", "Chapter", "Faculty", "Campus", "Guild", "Practice"];
const LOG_VERB: Record<string, string> = { "org.node_created": "added", "org.node_renamed": "edited", "org.node_moved": "moved", "org.node_deleted": "deleted" };

function useOrgMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["org-nodes"] }); qc.invalidateQueries({ queryKey: ["org-log"] }); qc.invalidateQueries({ queryKey: ["members"] }); qc.invalidateQueries({ queryKey: ["pool"] }); };
  return {
    create: useMutation({ mutationFn: (b: { name: string; nodeType: string; parentId: string | null }) => api("/api/org/nodes", { method: "POST", body: JSON.stringify(b) }), onSuccess: invalidate }),
    update: useMutation({ mutationFn: (b: { id: string; name?: string; nodeType?: string; parentId?: string | null }) => api(`/api/org/nodes/${b.id}`, { method: "PATCH", body: JSON.stringify(b) }), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => api(`/api/org/nodes/${id}`, { method: "DELETE" }), onSuccess: invalidate }),
    loadDemo: useMutation({ mutationFn: () => api("/api/org/demo", { method: "POST" }), onSuccess: invalidate }),
  };
}

export function OrgStructurePage() {
  const { data } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const { data: logData } = useQuery({ queryKey: ["org-log"], queryFn: () => api<{ log: LogEntry[] }>("/api/org/log") });
  const m = useOrgMutations();
  const [name, setName] = useState("");
  const [nodeType, setNodeType] = useState("");
  const [parentId, setParentId] = useState("");
  const nodes = data?.nodes ?? [];

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !nodeType.trim()) return;
    m.create.mutate({ name: name.trim(), nodeType: nodeType.trim(), parentId: parentId || null }, { onSuccess: () => { setName(""); setNodeType(""); } });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Org structure" subtitle="Build & manage your hierarchy — name the levels however your organization does." />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Add a node</h2>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input placeholder="Name (e.g. Marketing)" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-44" />
          <input list="org-levels" placeholder="Level (e.g. Department)" value={nodeType} onChange={(e) => setNodeType(e.target.value)} className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <datalist id="org-levels">{TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Top level</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{"  ".repeat(n.path.split(".").length - 1)}{n.name}</option>)}
          </select>
          <Button type="submit" disabled={m.create.isPending}>Add</Button>
        </form>
        {m.create.isError && <p className="mt-2 text-sm text-red-600">Could not add — check the parent.</p>}
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Hierarchy</h2>
          {nodes.length === 0 && <button onClick={() => m.loadDemo.mutate()} disabled={m.loadDemo.isPending} className="text-xs text-primary hover:underline">Load demo data</button>}
        </div>
        {nodes.length === 0 ? (
          <p className="text-sm text-muted">No structure yet. Add a top-level node above, or load demo data to explore.</p>
        ) : (
          <ul className="space-y-0.5">{nodes.map((n) => <NodeRow key={n.id} node={n} nodes={nodes} m={m} />)}</ul>
        )}
        {m.remove.isError && <p className="mt-2 text-sm text-red-600">Can't delete — it has child nodes or people assigned.</p>}
        {m.update.isError && <p className="mt-2 text-sm text-red-600">Move failed — you can't move a node under itself.</p>}
      </Card>

      {logData && logData.log.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-muted">Recent changes</h2>
          <ul className="space-y-1 text-sm">
            {logData.log.map((e, i) => (
              <li key={i} className="flex items-center justify-between text-muted">
                <span><span className="text-fg">{e.actorName ?? "Someone"}</span> {LOG_VERB[e.action] ?? e.action} {e.meta?.name ? <span className="text-fg">“{e.meta.name}”</span> : "a node"}</span>
                <span className="text-xs">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function NodeRow({ node, nodes, m }: { node: OrgNode; nodes: OrgNode[]; m: ReturnType<typeof useOrgMutations> }) {
  const depth = node.path.split(".").length - 1;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  // Valid new parents: anything that isn't this node or one of its descendants.
  const parents = nodes.filter((n) => n.path !== node.path && !n.path.startsWith(`${node.path}.`));

  return (
    <li className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-border/20" style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}>
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-44 py-0" />
          <button onClick={() => { if (name.trim() && name.trim() !== node.name) m.update.mutate({ id: node.id, name: name.trim() }); setEditing(false); }} className="text-xs text-primary hover:underline">save</button>
          <button onClick={() => { setName(node.name); setEditing(false); }} className="text-xs text-muted hover:underline">cancel</button>
        </>
      ) : (
        <>
          <button onClick={() => setEditing(true)} className="font-medium text-fg hover:underline" title="Rename">{node.name}</button>
          <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{node.nodeType}</span>
          {node.memberCount > 0 && <span className="text-xs text-muted">· {node.memberCount} {node.memberCount === 1 ? "person" : "people"}</span>}
          <select value={node.parentId ?? ""} onChange={(e) => m.update.mutate({ id: node.id, parentId: e.target.value || null })} className="ml-auto rounded border border-border bg-surface px-1 py-0.5 text-xs text-muted" title="Move under…">
            <option value="">↑ Top level</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => m.remove.mutate(node.id)} className="text-xs text-red-600 hover:underline">delete</button>
        </>
      )}
    </li>
  );
}
