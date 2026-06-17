import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const REPO_CATEGORIES = [
  { key: "POLICY", label: "Policies" },
  { key: "TOOLS", label: "Tools & Access" },
  { key: "PROTOCOL", label: "Protocols" },
  { key: "MEETING", label: "Meetings & Events" },
  { key: "NEWS", label: "News & Links" },
  { key: "GENERAL", label: "General" },
];
export const categoryLabel = (k: string) => REPO_CATEGORIES.find((c) => c.key === k)?.label ?? k;

export type RepoItem = { id: string; kind: string; category: string; title: string; url: string | null; body: string | null; itemDate: string | null; status: string; createdAt: string; nodeName: string; nodeType: string; submitterName: string; commentCount: number; canEdit: boolean };
export type RepoComment = { id: string; body: string; createdAt: string; name: string };
export type RepoScope = { id: string; name: string; nodeType: string };
export type PendingItem = { id: string; nodeId: string; kind: string; title: string; url: string | null; body: string | null; createdAt: string; nodeName: string; submitterName: string };
export type Approver = { nodeId: string; userId: string; nodeName: string; userName: string };
export type RepoDomain = { id: string; domain: string };

export function useRepoItems() {
  return useQuery({ queryKey: ["repo-items"], queryFn: () => api<{ items: RepoItem[] }>("/api/repo/items") });
}
export function useRepoScopes() {
  return useQuery({ queryKey: ["repo-scopes"], queryFn: () => api<{ scopes: RepoScope[] }>("/api/repo/scopes") });
}
export function useRepoPending() {
  return useQuery({ queryKey: ["repo-pending"], queryFn: () => api<{ items: PendingItem[] }>("/api/repo/pending") });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["repo-items"] });
  qc.invalidateQueries({ queryKey: ["repo-pending"] });
}

export function useAddRepoItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: string; category: string; title: string; nodeId: string; url?: string | null; body?: string | null; itemDate?: string | null }) => api<{ status: string }>("/api/repo/items", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => invalidate(qc),
  });
}
export function useEditRepoItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; category?: string; title?: string; url?: string | null; body?: string | null; itemDate?: string | null }) => {
      const { id, ...rest } = v;
      return api<{ status: string }>(`/api/repo/items/${id}`, { method: "PATCH", body: JSON.stringify(rest) });
    },
    onSuccess: () => invalidate(qc),
  });
}
export function useRepoComments(itemId: string, enabled: boolean) {
  return useQuery({ queryKey: ["repo-comments", itemId], queryFn: () => api<{ comments: RepoComment[] }>(`/api/repo/items/${itemId}/comments`), enabled });
}
export function useAddRepoComment(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/api/repo/items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["repo-comments", itemId] }); qc.invalidateQueries({ queryKey: ["repo-items"] }); },
  });
}
export function useReviewRepoItem(action: "approve" | "reject") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/repo/items/${id}/${action}`, { method: "POST" }),
    onSuccess: () => invalidate(qc),
  });
}

// --- Admin ---
export function useRepoApprovers() {
  return useQuery({ queryKey: ["repo-approvers"], queryFn: () => api<{ approvers: Approver[] }>("/api/repo/approvers") });
}
export function useAddApprover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { nodeId: string; userId: string }) => api("/api/repo/approvers", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repo-approvers"] }),
  });
}
export function useRemoveApprover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { nodeId: string; userId: string }) => api("/api/repo/approvers", { method: "DELETE", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repo-approvers"] }),
  });
}
export function useRepoDomains() {
  return useQuery({ queryKey: ["repo-domains"], queryFn: () => api<{ domains: RepoDomain[] }>("/api/repo/domains") });
}
export function useAddDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api("/api/repo/domains", { method: "POST", body: JSON.stringify({ domain }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repo-domains"] }),
  });
}
export function useRemoveDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/repo/domains/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repo-domains"] }),
  });
}
