import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { type InviteBatch, type Participant, useBulkParticipants, useCancelBatch, useCandidates, useEntrantAction, useInviteScope, useParticipantAction, usePassHost, useScopePreview, useSetSessionRole } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

const LARGE_INVITE = 15;
type OrgNode = { id: string; name: string; path: string };
type OrgNodeFull = { id: string; name: string; nodeType: string; parentId: string | null };

// Invite a whole group/department at once — with an "are you sure" for large groups.
function BulkInvite({ sessionId }: { sessionId: string }) {
  const { data: orgData } = useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes") });
  const { data: groupData } = useQuery({ queryKey: ["groups"], queryFn: () => api<{ groups: { id: string; name: string }[] }>("/api/groups") });
  const [val, setVal] = useState("");
  const [confirming, setConfirming] = useState(false);
  const scope = val === "" ? null : val === "all" ? { scopeKind: "ALL", scopeId: null } : val.startsWith("g:") ? { scopeKind: "GROUP", scopeId: val.slice(2) } : { scopeKind: "NODE", scopeId: val };
  const { data: preview } = useScopePreview(sessionId, scope);
  const invite = useInviteScope(sessionId);
  const count = preview?.count ?? 0;

  function go() {
    if (!scope) return;
    invite.mutate(scope, { onSuccess: () => { setVal(""); setConfirming(false); } });
  }

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-muted">Invite a group</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={val} onChange={(e) => { setVal(e.target.value); setConfirming(false); }} className="flex-1 min-w-44 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="">Choose a group…</option>
          <option value="all">Entire org</option>
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
        {scope && !confirming && (
          <Button onClick={() => (count >= LARGE_INVITE ? setConfirming(true) : go())} disabled={count === 0 || invite.isPending}>
            {count === 0 ? "No new people" : `Invite ${count}`}
          </Button>
        )}
      </div>
      {scope && confirming && (
        <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
          ⚠ This will invite <span className="font-semibold">{count} people</span>. Are you sure?
          <div className="mt-2 flex gap-2">
            <Button variant="danger" onClick={go} disabled={invite.isPending}>Yes, invite {count}</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// A live invite batch with a cancel-with-reason flow.
function BatchRow({ sessionId, batch }: { sessionId: string; batch: InviteBatch }) {
  const cancel = useCancelBatch(sessionId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="text-sm">
      <div className="flex items-center justify-between">
        <span>{batch.scopeLabel} <span className="text-xs text-muted">· {batch.count} invited{batch.byName ? ` · by ${batch.byName}` : ""}</span></span>
        {!open && <button onClick={() => setOpen(true)} className="text-xs text-red-600 hover:underline">cancel group</button>}
      </div>
      {open && (
        <div className="mt-1 flex gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="flex-1" />
          <Button variant="danger" onClick={() => cancel.mutate({ batchId: batch.id, reason }, { onSuccess: () => setOpen(false) })} disabled={cancel.isPending}>Cancel invite</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Back</Button>
        </div>
      )}
    </li>
  );
}

// Autosuggest box to invite more people mid-session (host/co-host).
function InviteMore({ sessionId }: { sessionId: string }) {
  const { data } = useCandidates(sessionId);
  const invite = useParticipantAction("invite");
  const [val, setVal] = useState("");
  const people = data?.people ?? [];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const match = people.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
        if (match) invite.mutate({ sessionId, userId: match.id }, { onSuccess: () => setVal("") });
      }}
      className="flex gap-2"
    >
      <Input list={`cand-${sessionId}`} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Invite someone by name…" className="flex-1" />
      <datalist id={`cand-${sessionId}`}>{people.map((p) => <option key={p.id} value={p.name}>{p.node ?? ""}</option>)}</datalist>
      <Button type="submit">Invite</Button>
    </form>
  );
}

// "⋯" actions menu for a single participant; closes on outside click or after an action.
function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded px-2 leading-none text-muted hover:bg-border/40" title="Actions" aria-label="Actions">⋯</button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg">
          {items.map((it, i) => (
            <button key={i} onClick={() => { it.onClick(); setOpen(false); }} className={cn("block w-full px-3 py-1.5 text-left text-xs hover:bg-border/40", it.danger && "text-red-600")}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATE_LABEL: Record<string, string> = { JOINED: "in session", INVITED: "invited", LEFT: "left", DECLINED: "declined", REMOVED: "removed", MISSED: "missed" };
const STATUS_BUCKETS = [
  { key: "JOINED", label: "In session", match: (p: Participant) => p.state === "JOINED" },
  { key: "INVITED", label: "Invited", match: (p: Participant) => p.state === "INVITED" },
  { key: "INACTIVE", label: "Left / declined", match: (p: Participant) => ["LEFT", "DECLINED", "MISSED"].includes(p.state) },
  { key: "REMOVED", label: "Removed", match: (p: Participant) => p.state === "REMOVED" },
];

// Walk up the org tree to the nearest ancestor of a given node type (for dept/division grouping).
function ancestorOfType(nodeId: string | null, type: string, map: Map<string, OrgNodeFull>): OrgNodeFull | null {
  let cur = nodeId ? map.get(nodeId) ?? null : null;
  let guard = 0;
  while (cur && guard++ < 20) {
    if (cur.nodeType === type) return cur;
    cur = cur.parentId ? map.get(cur.parentId) ?? null : null;
  }
  return null;
}

type Group = { key: string; label: string; items: Participant[] };

function buildGroups(list: Participant[], groupBy: string, orgMap: Map<string, OrgNodeFull>): Group[] {
  if (groupBy === "status") {
    const revoked = list.filter((p) => p.accessRevoked);
    const rest = list.filter((p) => !p.accessRevoked);
    const groups: Group[] = STATUS_BUCKETS.map((b) => ({ key: b.key, label: b.label, items: rest.filter(b.match) })).filter((g) => g.items.length > 0);
    if (revoked.length) groups.push({ key: "REVOKED", label: "Revoked access", items: revoked });
    return groups;
  }
  const type = groupBy === "department" ? "DEPARTMENT" : "DIVISION";
  const map = new Map<string, Group>();
  for (const p of list) {
    const anc = ancestorOfType(p.nodeId, type, orgMap);
    const key = anc?.id ?? (groupBy === "department" && p.node ? `n:${p.node}` : "__none");
    const label = anc?.name ?? (groupBy === "department" ? p.node ?? "Unassigned" : "Unassigned");
    if (!map.has(key)) map.set(key, { key, label, items: [] });
    map.get(key)!.items.push(p);
  }
  return [...map.values()].sort((a, b) => (a.key === "__none" ? 1 : b.key === "__none" ? -1 : a.label.localeCompare(b.label)));
}

// The managed people list: search, group-by, multi-select + bulk ops, per-row menu.
function PeopleManager({ sessionId, hostName, isHost, canControl, people }: { sessionId: string; hostName: string; isHost: boolean; canControl: boolean; people: Participant[] }) {
  const remove = useParticipantAction("remove");
  const reinvite = useParticipantAction("invite");
  const setRole = useSetSessionRole(sessionId);
  const passHost = usePassHost(sessionId);
  const revoke = useEntrantAction(sessionId, "revoke");
  const bulk = useBulkParticipants(sessionId);

  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"status" | "department" | "division">("status");
  const [selectMode, setSelectMode] = useState(false); // checkboxes only show once "Select multiple" is on
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const showSel = canControl && selectMode;

  const { data: orgData } = useQuery({
    queryKey: ["org-nodes"],
    queryFn: () => api<{ nodes: OrgNodeFull[] }>("/api/org/nodes"),
    enabled: groupBy !== "status",
  });
  const orgMap = useMemo(() => new Map((orgData?.nodes ?? []).map((n) => [n.id, n])), [orgData]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => (q ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.node ?? "").toLowerCase().includes(q)) : people), [people, q]);
  const groups = useMemo(() => buildGroups(filtered, groupBy, orgMap), [filtered, groupBy, orgMap]);

  // Keep selection in sync with what's visible (drop anyone filtered out).
  const visibleIds = useMemo(() => new Set(filtered.map((p) => p.userId)), [filtered]);
  const selectedVisible = [...selected].filter((id) => visibleIds.has(id));

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setMany(ids: string[], on: boolean) {
    setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  }

  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  const valid = {
    remove: (p: Participant) => p.state === "INVITED" || p.state === "JOINED",
    reinvite: (p: Participant) => !["JOINED", "PENDING"].includes(p.state),
    revoke: (p: Participant) => isHost && !p.accessRevoked,
  };
  function applyBulk(action: "remove" | "reinvite" | "revoke") {
    const targets = selectedVisible.map((id) => byId.get(id)!).filter(Boolean).filter(valid[action]).map((p) => p.userId);
    if (targets.length === 0) return;
    if ((action === "remove" || action === "revoke") && !confirm(`${action === "remove" ? "Remove" : "Revoke access for"} ${targets.length} ${targets.length === 1 ? "person" : "people"}?`)) return;
    bulk.mutate({ action, userIds: targets }, { onSuccess: () => setSelected(new Set()) });
  }

  function rowItems(p: Participant) {
    const items: { label: string; onClick: () => void; danger?: boolean }[] = [];
    if (isHost && p.state === "JOINED") {
      items.push(p.role === "COHOST" ? { label: "Remove co-host", onClick: () => setRole.mutate({ userId: p.userId, role: "MEMBER" }) } : { label: "Make co-host", onClick: () => setRole.mutate({ userId: p.userId, role: "COHOST" }) });
      items.push(p.role === "ACTIVITY_ADMIN" ? { label: "Remove activity admin", onClick: () => setRole.mutate({ userId: p.userId, role: "MEMBER" }) } : { label: "Make activity admin", onClick: () => setRole.mutate({ userId: p.userId, role: "ACTIVITY_ADMIN" }) });
    }
    if (isHost && p.state === "JOINED") items.push({ label: "Pass host", onClick: () => passHost.mutate(p.userId) });
    if (canControl && p.state === "INVITED") items.push({ label: "Remind", onClick: () => reinvite.mutate({ sessionId, userId: p.userId }) });
    if (canControl && ["DECLINED", "LEFT", "REMOVED", "MISSED"].includes(p.state)) items.push({ label: "Re-invite", onClick: () => reinvite.mutate({ sessionId, userId: p.userId }) });
    if (canControl && (p.state === "INVITED" || p.state === "JOINED")) items.push({ label: "Remove", danger: true, onClick: () => remove.mutate({ sessionId, userId: p.userId }) });
    if (isHost && !p.accessRevoked) items.push({ label: "Revoke access", danger: true, onClick: () => { if (confirm(`Revoke ${p.name}'s access? They won't see this session or its log.`)) revoke.mutate(p.userId); } });
    return items;
  }

  const tabBtn = (key: typeof groupBy, label: string) => (
    <button onClick={() => setGroupBy(key)} className={cn("rounded-md px-2 py-1 text-xs font-medium", groupBy === key ? "bg-primary/10 text-primary" : "text-muted hover:text-fg")}>{label}</button>
  );

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">People ({people.length})</h2>
        <div className="flex items-center gap-1 rounded-lg bg-bg p-0.5">
          {tabBtn("status", "Status")}
          {tabBtn("department", "Department")}
          {tabBtn("division", "Division")}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" className="flex-1" />
        {canControl && !selectMode && (
          <button onClick={() => setSelectMode(true)} className="whitespace-nowrap text-xs text-primary hover:underline">Select multiple</button>
        )}
        {showSel && (
          <>
            {filtered.length > 0 && (
              <button onClick={() => setMany(filtered.map((p) => p.userId), selectedVisible.length !== filtered.length)} className="whitespace-nowrap text-xs text-primary hover:underline">
                {selectedVisible.length === filtered.length ? "Clear all" : `Select all (${filtered.length})`}
              </button>
            )}
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="whitespace-nowrap text-xs text-muted hover:underline">Done</button>
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {showSel && selectedVisible.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selectedVisible.length} selected</span>
          <span className="flex-1" />
          <button onClick={() => applyBulk("reinvite")} className="text-xs text-primary hover:underline" disabled={bulk.isPending}>Re-invite</button>
          <button onClick={() => applyBulk("remove")} className="text-xs text-red-600 hover:underline" disabled={bulk.isPending}>Remove</button>
          {isHost && <button onClick={() => applyBulk("revoke")} className="text-xs text-red-600 hover:underline" disabled={bulk.isPending}>Revoke</button>}
          <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:underline">Clear</button>
        </div>
      )}

      {/* Host (pinned, not selectable) */}
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-sm">
        {showSel && <span className="w-4" />}
        <span>{hostName} <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">HOST</span></span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">{q ? "No one matches your search." : "No one invited yet."}</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const groupIds = g.items.map((p) => p.userId);
            const allSel = showSel && groupIds.every((id) => selected.has(id));
            const isOpen = !collapsed.has(g.key);
            return (
              <div key={g.key}>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
                  {showSel && (
                    <input type="checkbox" checked={allSel} onChange={() => setMany(groupIds, !allSel)} title="Select group" />
                  )}
                  <button onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })} className="flex items-center gap-1 hover:text-fg">
                    <span>{isOpen ? "▾" : "▸"}</span>
                    <span>{g.label} ({g.items.length})</span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="space-y-1">
                    {g.items.map((p) => (
                      <li key={p.userId} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-bg">
                        {showSel && <input type="checkbox" checked={selected.has(p.userId)} onChange={() => toggle(p.userId)} />}
                        <span className="min-w-0 flex-1 truncate">
                          {p.name}
                          {p.node && <span className="text-muted"> · {p.node}</span>}
                          {p.role === "COHOST" && <span className="ml-1 rounded bg-border/60 px-1.5 py-0.5 text-xs text-muted">CO-HOST</span>}
                          {p.role === "ACTIVITY_ADMIN" && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">ACTIVITY ADMIN</span>}
                          {p.accessRevoked && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">revoked</span>}
                          {groupBy !== "status" && <span className="ml-1 text-xs text-muted">· {STATE_LABEL[p.state] ?? p.state.toLowerCase()}</span>}
                        </span>
                        {canControl && <RowMenu items={rowItems(p)} />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function ParticipantsTab({
  sessionId,
  hostName,
  isHost,
  canControl,
  participants,
  inviteBatches,
}: {
  sessionId: string;
  hostName: string;
  isHost: boolean;
  canControl: boolean;
  participants: Participant[];
  inviteBatches: InviteBatch[];
}) {
  const approve = useEntrantAction(sessionId, "approve");
  const deny = useEntrantAction(sessionId, "deny");
  const bulk = useBulkParticipants(sessionId);

  const waiting = participants.filter((p) => p.state === "PENDING");
  const people = participants.filter((p) => p.state !== "PENDING");

  return (
    <div className="space-y-4">
      {canControl && waiting.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Waiting to join ({waiting.length})</h2>
            <span className="flex gap-3 text-xs">
              <button onClick={() => bulk.mutate({ action: "admit", userIds: waiting.map((p) => p.userId) })} className="text-primary hover:underline">admit all</button>
              <button onClick={() => bulk.mutate({ action: "deny", userIds: waiting.map((p) => p.userId) })} className="text-red-600 hover:underline">deny all</button>
            </span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {waiting.map((p) => (
              <li key={p.userId} className="flex items-center justify-between">
                <span>{p.name}{p.node && <span className="text-muted"> · {p.node}</span>}</span>
                <span className="flex gap-3">
                  <button onClick={() => approve.mutate(p.userId)} className="text-xs text-primary hover:underline">admit</button>
                  <button onClick={() => deny.mutate(p.userId)} className="text-xs text-red-600 hover:underline">deny</button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canControl && (
        <Card className="space-y-4">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">Invite a teammate</h2>
            <InviteMore sessionId={sessionId} />
          </div>
          <BulkInvite sessionId={sessionId} />
          {inviteBatches.filter((b) => !b.cancelledAt).length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-muted">Group invites</div>
              <ul className="space-y-2">
                {inviteBatches.filter((b) => !b.cancelledAt).map((b) => <BatchRow key={b.id} sessionId={sessionId} batch={b} />)}
              </ul>
            </div>
          )}
        </Card>
      )}

      <PeopleManager sessionId={sessionId} hostName={hostName} isHost={isHost} canControl={canControl} people={people} />
    </div>
  );
}
