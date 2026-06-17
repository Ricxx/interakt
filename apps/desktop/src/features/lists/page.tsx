import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useCreateList, useLists } from "../../lib/lists";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const RECURRENCE = ["NONE", "DAILY", "WEEKLY", "QUARTERLY"];
// Index sections, most-specific scope first.
const SECTIONS = [
  { kind: "GROUP", label: "Groups & committees" },
  { kind: "NODE", label: "Departments & teams" },
  { kind: "ALL", label: "Org-wide" },
];
type OrgNode = { id: string; name: string; path: string };
type Group = { id: string; name: string };

// Picker value → {scopeKind, scopeId}. "" = default (server uses the creator's department).
function parseScope(value: string): { scopeKind?: string; scopeId?: string } {
  if (value === "") return {};
  if (value === "ALL") return { scopeKind: "ALL" };
  const [kind, id] = value.split(":");
  return { scopeKind: kind, scopeId: id };
}

export function ListsPage() {
  const navigate = useNavigate();
  const { data } = useLists();
  const { data: orgData } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const { data: groupData } = useQuery({ queryKey: ["groups"], queryFn: () => api<{ groups: Group[] }>("/api/groups") });
  const create = useCreateList();
  const [title, setTitle] = useState("");
  const [recurrence, setRecurrence] = useState("NONE");
  const [scope, setScope] = useState(""); // "" = my department
  const [query, setQuery] = useState("");

  const nodes = (orgData?.nodes ?? []).filter((n) => n.path !== "org");
  const groups = groupData?.groups ?? [];

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), recurrence, ...parseScope(scope) },
      { onSuccess: (r) => { setTitle(""); setRecurrence("NONE"); setScope(""); navigate(`/lists/${r.list.id}`); } },
    );
  }

  const lists = data?.lists ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q ? lists.filter((l) => l.title.toLowerCase().includes(q)) : lists;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Lists" subtitle="Shared checklists anyone can tick off. Daily, weekly, or one-off." />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">New list</h2>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input placeholder="List title (e.g. Friday close-down)" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 min-w-48" />
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {RECURRENCE.map((r) => <option key={r} value={r}>{r === "NONE" ? "One-off" : r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" title="Who can see this list">
            <option value="">My department</option>
            <option value="ALL">Org-wide</option>
            {nodes.length > 0 && (
              <optgroup label="Department / team">
                {nodes.map((n) => <option key={n.id} value={`NODE:${n.id}`}>{"  ".repeat(n.path.split(".").length - 1)}{n.name}</option>)}
              </optgroup>
            )}
            {groups.length > 0 && (
              <optgroup label="Group / committee">
                {groups.map((g) => <option key={g.id} value={`GROUP:${g.id}`}>{g.name}</option>)}
              </optgroup>
            )}
          </select>
          <Button type="submit" disabled={create.isPending || !title.trim()}>{create.isPending ? "…" : "Create"}</Button>
        </form>
      </Card>

      <Card>
        <Input placeholder="Search lists…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4" />
        {lists.length === 0 && <p className="text-sm text-muted">No lists yet. Create one above.</p>}
        {lists.length > 0 && filtered.length === 0 && <p className="text-sm text-muted">No lists match “{query}”.</p>}
        {SECTIONS.map((s) => {
          const inSection = filtered.filter((l) => l.scopeKind === s.kind);
          if (inSection.length === 0) return null;
          return (
            <div key={s.kind} className="mb-4 last:mb-0">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">{s.label}</h2>
              <ul className="divide-y divide-border">
                {inSection.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => navigate(`/lists/${l.id}`)} className="flex w-full items-center justify-between py-3 text-left hover:opacity-80">
                      <span className="flex items-center gap-2">
                        {l.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="Updated since you last looked" />}
                        <span className={l.unread ? "font-semibold" : "font-medium"}>{l.title}</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{l.scope}</span>
                        {l.recurrence !== "NONE" && <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{l.recurrence.toLowerCase()}</span>}
                        {l.status === "CLOSED" && <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">closed</span>}
                      </span>
                      <span className="text-sm text-muted">{l.done}/{l.total} done</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
