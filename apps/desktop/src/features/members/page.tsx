import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAssignNode, useInvite, useMe, useMemberLifecycle, useMembers, useRevokeInvite, useResendInvite, useReviewMember, useSetRegistrationMode } from "../../lib/auth";
import { type PermGroup, useMemberGroups, usePermGroups, useToggleMemberGroup } from "../../lib/permissions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { PageHeader } from "../../ui/page-header";

const ROLES = ["MEMBER", "FACILITATOR", "NODE_ADMIN", "TENANT_ADMIN"];

type OrgNode = { id: string; name: string; path: string };

function JobTitleCell({ id, jobTitle }: { id: string; jobTitle: string | null }) {
  const update = useAssignNode();
  const [v, setV] = useState(jobTitle ?? "");
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if ((jobTitle ?? "") !== v.trim()) update.mutate({ id, jobTitle: v.trim() || null }); }}
      placeholder="—"
      className="w-32 rounded border border-border bg-surface px-1.5 py-0.5 text-xs"
    />
  );
}

function DepartmentSelect({ id, nodeId, nodes }: { id: string; nodeId: string | null; nodes: OrgNode[] }) {
  const assign = useAssignNode();
  return (
    <select
      value={nodeId ?? ""}
      onChange={(e) => assign.mutate({ id, nodeId: e.target.value || null })}
      className="rounded border border-border bg-surface px-2 py-1 text-sm"
    >
      <option value="">Unassigned</option>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {"  ".repeat(n.path.split(".").length - 1)}
          {n.name}
        </option>
      ))}
    </select>
  );
}

function PermGroupsCell({ userId, allGroups }: { userId: string; allGroups: PermGroup[] }) {
  const { data } = useMemberGroups(userId);
  const toggle = useToggleMemberGroup();
  const ids = new Set(data?.groupIds ?? []);
  const mine = allGroups.filter((g) => ids.has(g.id));
  const avail = allGroups.filter((g) => !ids.has(g.id));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {mine.map((g) => (
        <span key={g.id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {g.name}
          <button onClick={() => toggle.mutate({ userId, groupId: g.id, on: false })} className="hover:text-red-600">×</button>
        </span>
      ))}
      {avail.length > 0 && (
        <select value="" onChange={(e) => e.target.value && toggle.mutate({ userId, groupId: e.target.value, on: true })} className="rounded border border-border bg-surface px-1 py-0.5 text-xs">
          <option value="">+ group</option>
          {avail.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
    </div>
  );
}

function RegistrationModeCard({ mode }: { mode: string }) {
  const set = useSetRegistrationMode();
  const open = mode === "OPEN";
  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-muted">Registration</h2>
      <p className="mb-3 text-sm text-fg">
        {open
          ? "Anyone can request an account from the sign-in page. New accounts wait for approval below."
          : "New accounts are added by invite only."}
      </p>
      <div className="flex gap-2">
        <Button variant={open ? "ghost" : "primary"} onClick={() => set.mutate("INVITE_ONLY")} disabled={set.isPending || !open}>
          Invite only
        </Button>
        <Button variant={open ? "primary" : "ghost"} onClick={() => set.mutate("OPEN")} disabled={set.isPending || open}>
          Open self-registration
        </Button>
      </div>
    </Card>
  );
}

function PendingApprovalCard({ pending }: { pending: { id: string; displayName: string; email: string }[] }) {
  const approve = useReviewMember("approve");
  const reject = useReviewMember("reject");
  if (pending.length === 0) return null;
  return (
    <Card className="mb-6 border-amber-300">
      <h2 className="mb-3 text-sm font-semibold text-muted">Awaiting approval ({pending.length})</h2>
      <table className="w-full text-sm">
        <tbody>
          {pending.map((m) => (
            <tr key={m.id} className="border-t border-border first:border-t-0">
              <td className="py-2">{m.displayName}</td>
              <td className="py-2 text-muted">{m.email}</td>
              <td className="py-2 text-right">
                <span className="flex items-center justify-end gap-3">
                  <button onClick={() => approve.mutate(m.id)} className="text-xs text-green-600 hover:underline">Approve</button>
                  <button onClick={() => reject.mutate(m.id)} className="text-xs text-red-600 hover:underline">Reject</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function MembersPage() {
  const { data } = useMembers();
  const { data: me } = useMe();
  const { data: permData } = usePermGroups();
  const allGroups = permData?.groups ?? [];
  const pendingMembers = (data?.members ?? []).filter((m) => m.status === "PENDING");
  const activeMembers = (data?.members ?? []).filter((m) => m.status !== "PENDING");
  const { data: orgData } = useQuery({
    queryKey: ["org-nodes"],
    queryFn: () => api<{ nodes: OrgNode[] }>("/api/org/nodes"),
  });
  const nodes = (orgData?.nodes ?? []).filter((n) => n.path !== "org");
  const invite = useInvite();
  const revoke = useRevokeInvite();
  const resend = useResendInvite();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");

  function send(e: React.FormEvent) {
    e.preventDefault();
    invite.mutate({ email, role }, { onSuccess: () => setEmail("") });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Members" subtitle="Invite teammates and manage who has access." />

      <RegistrationModeCard mode={data?.registrationMode ?? "INVITE_ONLY"} />
      <PendingApprovalCard pending={pendingMembers} />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Invite a teammate</h2>
        <form onSubmit={send} className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 min-w-48"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </form>
        {invite.isError && <p className="mt-2 text-sm text-red-600">Could not send (already a member?).</p>}
        {invite.isSuccess && <p className="mt-2 text-sm text-green-600">Invite sent.</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">People</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Job title</th>
              <th className="pb-2 font-medium">Department</th>
              <th className="pb-2 font-medium">Permission groups</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="py-2">{m.displayName}</td>
                <td className="py-2">{m.email}</td>
                <td className="py-2">{m.role}</td>
                <td className="py-2"><JobTitleCell id={m.id} jobTitle={m.jobTitle} /></td>
                <td className="py-2">
                  <DepartmentSelect id={m.id} nodeId={m.nodeId} nodes={nodes} />
                </td>
                <td className="py-2"><PermGroupsCell userId={m.id} allGroups={allGroups} /></td>
                <td className="py-2 text-muted">{m.erasedAt ? "Erased" : m.status}</td>
                <td className="py-2"><MemberActions id={m.id} status={m.status} erased={!!m.erasedAt} isSelf={m.id === me?.id} /></td>
              </tr>
            ))}
            {data?.pending.map((p) => (
              <tr key={p.id} className="border-t border-border text-muted">
                <td className="py-2 italic">Invited</td>
                <td className="py-2">{p.email}</td>
                <td className="py-2">{p.role}</td>
                <td className="py-2">—</td>
                <td className="py-2">—</td>
                <td className="py-2">—</td>
                <td className="py-2">
                  <span className="flex items-center gap-3">
                    Pending
                    <button onClick={() => resend.mutate(p.id)} className="text-xs text-primary hover:underline">
                      Resend
                    </button>
                    <button onClick={() => revoke.mutate(p.id)} className="text-xs text-red-600 hover:underline">
                      Revoke
                    </button>
                  </span>
                </td>
                <td className="py-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Offboarding controls for a member row: deactivate (reversible) and erase (right-to-erasure, final).
function MemberActions({ id, status, erased, isSelf }: { id: string; status: string; erased: boolean; isSelf: boolean }) {
  const { deactivate, reactivate, erase } = useMemberLifecycle();
  if (isSelf || erased) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="flex items-center gap-2 text-xs">
      {status === "DISABLED" ? (
        <button onClick={() => reactivate.mutate(id)} className="text-primary hover:underline">Reactivate</button>
      ) : (
        <button onClick={() => deactivate.mutate(id)} className="text-muted hover:text-fg hover:underline">Deactivate</button>
      )}
      <button
        onClick={() => { if (confirm("Erase this person's personal data? This is permanent and cannot be undone. Their activity history stays but is no longer linked to their name/email.")) erase.mutate(id); }}
        className="text-red-600 hover:underline"
      >
        Erase
      </button>
    </span>
  );
}
