import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useMembers } from "../../lib/auth";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

type Group = { id: string; name: string; members: { id: string; name: string }[] };

function useGroupMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["pool"] });
  };
  return {
    create: useMutation({
      mutationFn: (name: string) => api("/api/groups", { method: "POST", body: JSON.stringify({ name }) }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/api/groups/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    addMember: useMutation({
      mutationFn: (v: { id: string; userId: string }) =>
        api(`/api/groups/${v.id}/members`, { method: "POST", body: JSON.stringify({ userId: v.userId }) }),
      onSuccess: invalidate,
    }),
    removeMember: useMutation({
      mutationFn: (v: { id: string; userId: string }) =>
        api(`/api/groups/${v.id}/members/${v.userId}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function GroupsPage() {
  const { data } = useQuery({ queryKey: ["groups"], queryFn: () => api<{ groups: Group[] }>("/api/groups") });
  const { data: memberData } = useMembers();
  const m = useGroupMutations();
  const [name, setName] = useState("");

  const allPeople = memberData?.members ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Groups" subtitle="Committees, squads, and ad-hoc teams that cross the org chart." />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Create a group</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) m.create.mutate(name.trim(), { onSuccess: () => setName("") });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <Input placeholder="e.g. Social Committee" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-48" />
          <Button type="submit" disabled={m.create.isPending}>Create</Button>
        </form>
      </Card>

      <div className="space-y-4">
        {data?.groups.map((g) => {
          const memberIds = new Set(g.members.map((x) => x.id));
          const available = allPeople.filter((p) => !memberIds.has(p.id));
          return (
            <Card key={g.id}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">{g.name}</h3>
                <button onClick={() => m.remove.mutate(g.id)} className="text-xs text-red-600 hover:underline">
                  Delete group
                </button>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {g.members.length === 0 && <span className="text-sm text-muted">No members yet.</span>}
                {g.members.map((mem) => (
                  <span key={mem.id} className="flex items-center gap-1 rounded-full bg-border/60 px-2.5 py-1 text-sm">
                    {mem.name}
                    <button onClick={() => m.removeMember.mutate({ id: g.id, userId: mem.id })} className="text-muted hover:text-fg">
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <select
                value=""
                onChange={(e) => e.target.value && m.addMember.mutate({ id: g.id, userId: e.target.value })}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Add a member…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </Card>
          );
        })}
        {data?.groups.length === 0 && <p className="text-sm text-muted">No groups yet. Create one above.</p>}
      </div>
    </div>
  );
}
