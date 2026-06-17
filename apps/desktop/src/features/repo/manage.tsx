import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useTaskPeople } from "../../lib/tasks";
import { useAddApprover, useAddDomain, useRemoveApprover, useRemoveDomain, useRepoApprovers, useRepoDomains } from "../../lib/repo";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

type OrgNode = { id: string; name: string; nodeType: string };

export function RepoManage() {
  const { data: domainData } = useRepoDomains();
  const addDomain = useAddDomain();
  const removeDomain = useRemoveDomain();
  const { data: approverData } = useRepoApprovers();
  const addApprover = useAddApprover();
  const removeApprover = useRemoveApprover();
  const { data: nodeData } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const { data: peopleData } = useTaskPeople();

  const [domain, setDomain] = useState("");
  const [node, setNode] = useState("");
  const [person, setPerson] = useState("");
  const domains = domainData?.domains ?? [];
  const approvers = approverData?.approvers ?? [];
  const nodes = nodeData?.nodes ?? [];
  const people = peopleData?.people ?? [];

  return (
    <Card className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-muted">Manage (admin)</h2>

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold text-muted">Whitelisted link domains — links here skip review</div>
        <div className="flex gap-2">
          <Input placeholder="e.g. wikipedia.org" value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && domain.trim() && addDomain.mutate(domain.trim(), { onSuccess: () => setDomain("") })} className="flex-1" />
          <Button onClick={() => domain.trim() && addDomain.mutate(domain.trim(), { onSuccess: () => setDomain("") })} disabled={!domain.trim() || addDomain.isPending}>Add</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {domains.map((d) => (
            <span key={d.id} className="flex items-center gap-1 rounded-full bg-border/60 px-2 py-0.5 text-xs">
              {d.domain}
              <button onClick={() => removeDomain.mutate(d.id)} className="text-muted hover:text-red-600">×</button>
            </span>
          ))}
          {domains.length === 0 && <span className="text-xs text-muted">None yet — all links need review.</span>}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold text-muted">Appointed approvers — they review items for a node and its sub-teams</div>
        <div className="flex flex-wrap gap-2">
          <select value={node} onChange={(e) => setNode(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Node…</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.nodeType.toLowerCase()})</option>)}
          </select>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Person…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button onClick={() => node && person && addApprover.mutate({ nodeId: node, userId: person }, { onSuccess: () => { setNode(""); setPerson(""); } })} disabled={!node || !person || addApprover.isPending}>Appoint</Button>
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          {approvers.map((a) => (
            <li key={`${a.nodeId}-${a.userId}`} className="flex items-center gap-2">
              <span className="font-medium">{a.userName}</span>
              <span className="text-xs text-muted">approves {a.nodeName}</span>
              <button onClick={() => removeApprover.mutate({ nodeId: a.nodeId, userId: a.userId })} className="text-xs text-red-600 hover:underline">remove</button>
            </li>
          ))}
          {approvers.length === 0 && <li className="text-xs text-muted">No approvers appointed — only admins can approve.</li>}
        </ul>
      </div>
    </Card>
  );
}
