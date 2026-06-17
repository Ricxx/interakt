import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

type OrgNode = { id: string; name: string; path: string };
type Person = { id: string; name: string; node: string | null };

export function RandomizerPage() {
  const { data: orgData } = useQuery({
    queryKey: ["org-nodes"],
    queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes"),
  });
  const { data: groupData } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<{ groups: { id: string; name: string }[] }>("/api/groups"),
  });
  // scope is "all", a node id, or "g:<groupId>" for a custom group.
  const [scope, setScope] = useState("all");
  const { data: poolData } = useQuery({
    queryKey: ["pool", scope],
    queryFn: () => {
      const q = scope.startsWith("g:") ? `groupId=${scope.slice(2)}` : `nodeId=${scope}`;
      return api<{ people: Person[] }>(`/api/randomizer/pool?${q}`);
    },
  });

  const [search, setSearch] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Person | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<number>();

  const people = poolData?.people ?? [];
  const filtered = useMemo(
    () => people.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [people, search],
  );
  const included = filtered.filter((p) => !excluded.has(p.id));

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function pick() {
    if (!included.length) return;
    window.clearInterval(timer.current);
    setSpinning(true);
    let ticks = 0;
    timer.current = window.setInterval(() => {
      setPicked(included[Math.floor(Math.random() * included.length)]);
      if (++ticks > 12) {
        window.clearInterval(timer.current);
        setSpinning(false);
      }
    }, 70);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Randomizer" subtitle="Pick someone at random from any part of the org." />

      {/* Controls */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPicked(null);
            }}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="all">Entire org</option>
            <optgroup label="Departments">
            {orgData?.nodes
              .filter((n) => n.path !== "org")
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {"  ".repeat(n.path.split(".").length - 1)}
                  {n.name}
                </option>
              ))}
            </optgroup>
            {groupData && groupData.groups.length > 0 && (
              <optgroup label="Custom groups">
                {groupData.groups.map((g) => (
                  <option key={g.id} value={`g:${g.id}`}>{g.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <Input
            placeholder="Search names…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-48"
          />
        </div>
      </Card>

      {/* Result + pick */}
      <Card className="mb-4 flex items-center justify-between">
        <div className={spinning ? "opacity-60" : ""}>
          {picked ? (
            <>
              <div className="text-2xl font-semibold">{picked.name}</div>
              {picked.node && <div className="text-sm text-muted">{picked.node}</div>}
            </>
          ) : (
            <div className="text-sm text-muted">No one picked yet.</div>
          )}
        </div>
        <Button onClick={pick} disabled={spinning || included.length === 0}>
          {spinning ? "Picking…" : "Pick random"}
        </Button>
      </Card>

      {/* Pool */}
      <Card>
        <div className="mb-3 text-sm text-muted">
          {included.length} of {filtered.length} included
        </div>
        <ul className="space-y-1">
          {filtered.map((p) => {
            const out = excluded.has(p.id);
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${out ? "opacity-40" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className={out ? "line-through" : ""}>{p.name}</span>
                  {p.node && <span className="rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">{p.node}</span>}
                </span>
                <button onClick={() => toggleExclude(p.id)} className="text-xs text-primary hover:underline">
                  {out ? "include" : "remove"}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No people in this scope.</li>}
        </ul>
      </Card>
    </div>
  );
}
