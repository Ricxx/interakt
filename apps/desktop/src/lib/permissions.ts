import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Capability = { key: string; category: string; label: string; scoped: boolean };
export type GroupCap = { capability: string; scope: string | null };
export type PermGroup = { id: string; name: string; level: number; caps: GroupCap[]; parentIds: string[]; memberCount: number };
export type GroupMember = { id: string; name: string };

// Reach is relative to where the person sits in the org tree (structure-agnostic).
export const SCOPE_LABEL: Record<string, string> = { SELF: "Self only", NODE: "Their unit & below", ORG: "Whole org" };

export function useCapabilities() {
  return useQuery({ queryKey: ["capabilities"], queryFn: () => api<{ capabilities: Capability[]; scopes: string[]; categories: string[] }>("/api/permission-groups/capabilities") });
}
export function usePermGroups() {
  return useQuery({ queryKey: ["perm-groups"], queryFn: () => api<{ groups: PermGroup[] }>("/api/permission-groups") });
}

function inval(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["perm-groups"] });
}

export function useCreatePermGroup() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { name: string; level: number }) => api("/api/permission-groups", { method: "POST", body: JSON.stringify(v) }), onSuccess: () => inval(qc) });
}
export function useUpdatePermGroup() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; name?: string; level?: number }) => api(`/api/permission-groups/${v.id}`, { method: "PATCH", body: JSON.stringify({ name: v.name, level: v.level }) }), onSuccess: () => inval(qc) });
}
export function useSetGroupParents() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; parentIds: string[] }) => api(`/api/permission-groups/${v.id}/parents`, { method: "PUT", body: JSON.stringify({ parentIds: v.parentIds }) }), onSuccess: () => inval(qc) });
}
export function useDuplicateGroup() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/permission-groups/${id}/duplicate`, { method: "POST" }), onSuccess: () => inval(qc) });
}
export function useMemberGroups(userId: string) {
  return useQuery({ queryKey: ["member-groups", userId], queryFn: () => api<{ groupIds: string[] }>(`/api/permission-groups/of/${userId}`) });
}
// Assign/unassign a member to a permission group (from the Members page).
export function useToggleMemberGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; groupId: string; on: boolean }) =>
      v.on
        ? api(`/api/permission-groups/${v.groupId}/members`, { method: "POST", body: JSON.stringify({ userId: v.userId }) })
        : api(`/api/permission-groups/${v.groupId}/members/${v.userId}`, { method: "DELETE" }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["member-groups", v.userId] }); inval(qc); },
  });
}
export function useDeletePermGroup() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/permission-groups/${id}`, { method: "DELETE" }), onSuccess: () => inval(qc) });
}
export function useSetGroupCaps() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; caps: GroupCap[] }) => api(`/api/permission-groups/${v.id}/caps`, { method: "PUT", body: JSON.stringify({ caps: v.caps }) }), onSuccess: () => inval(qc) });
}
export function useGroupMembers(groupId: string, enabled: boolean) {
  return useQuery({ queryKey: ["perm-group-members", groupId], queryFn: () => api<{ members: GroupMember[] }>(`/api/permission-groups/${groupId}/members`), enabled });
}
export function useAddGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/api/permission-groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ userId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["perm-group-members", groupId] }); inval(qc); },
  });
}
export function useRemoveGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/api/permission-groups/${groupId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["perm-group-members", groupId] }); inval(qc); },
  });
}
