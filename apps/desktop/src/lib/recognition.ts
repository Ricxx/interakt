import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// Preset badges — keys match the server's allow-list; emoji/label are display-only.
export const BADGES = [
  { key: "team-player", emoji: "🤝", label: "Team Player" },
  { key: "above-beyond", emoji: "🚀", label: "Above & Beyond" },
  { key: "helping-hand", emoji: "🙌", label: "Helping Hand" },
  { key: "bright-idea", emoji: "💡", label: "Bright Idea" },
  { key: "customer-hero", emoji: "⭐", label: "Customer Hero" },
  { key: "great-attitude", emoji: "😊", label: "Great Attitude" },
] as const;
export const badgeOf = (key: string) => BADGES.find((b) => b.key === key) ?? { key, emoji: "🎉", label: key };

export type Recognition = {
  id: string; kind: "BIGUP" | "AWARD"; badge: string; message: string; createdAt: string;
  fromName: string; fromId: string; recipientType: "USER" | "NODE" | "GROUP"; recipientName: string; recipientUserId: string | null; isGroupRecipient: boolean;
  recipientTitle: string | null; recipientDept: string | null;
  scope: string; canDelete: boolean; kudos: { name: string }[]; myKudos: "PUBLIC" | "ANON" | null; commentCount: number;
};
export type RecognitionComment = { id: string; body: string; createdAt: string; authorId: string; authorName: string; canDelete: boolean };
export type Board = { windowDays: number; people: { name: string; dept: string | null; count: number }[]; departments: { name: string; count: number }[] };

export type GiveInput = { recipientType: "USER" | "NODE" | "GROUP"; recipientId: string; badge: string; message: string; kind?: "BIGUP" | "AWARD"; scopeKind?: "ALL" };

export function useRecognitionWall(filter: "recent" | "past") {
  return useQuery({ queryKey: ["recognitions", filter], queryFn: () => api<{ items: Recognition[]; canAnon: boolean }>(`/api/recognitions?filter=${filter}`) });
}
export function useRecognitionBoard() {
  return useQuery({ queryKey: ["recognitions-board"], queryFn: () => api<Board>("/api/recognitions/board") });
}
// Unread badge — polled (no WS message type needed for a low-frequency "you got recognized" nudge).
export function useRecognitionUnread(enabled: boolean) {
  return useQuery({ queryKey: ["recognitions-unread"], queryFn: () => api<{ count: number }>("/api/recognitions/unread"), enabled, refetchInterval: 45_000 });
}
export function useMarkRecognitionRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api("/api/recognitions/read", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["recognitions-unread"] }) });
}
export function useRecognitionRecipients(id: string, enabled: boolean) {
  return useQuery({ queryKey: ["recognition-recipients", id], queryFn: () => api<{ people: { id: string; name: string }[] }>(`/api/recognitions/${id}/recipients`), enabled });
}
export function useGiveRecognition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: GiveInput) => api("/api/recognitions", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recognitions"] }); qc.invalidateQueries({ queryKey: ["recognitions-board"] }); },
  });
}
export function useDeleteRecognition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/recognitions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recognitions"] }); qc.invalidateQueries({ queryKey: ["recognitions-board"] }); },
  });
}
export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; anonymous: boolean }) => api<{ myKudos: "PUBLIC" | "ANON" | null; likes: number }>(`/api/recognitions/${v.id}/like`, { method: "POST", body: JSON.stringify({ anonymous: v.anonymous }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recognitions"] }),
  });
}
export function useRecognitionComments(id: string, enabled: boolean) {
  return useQuery({ queryKey: ["recognition-comments", id], queryFn: () => api<{ comments: RecognitionComment[] }>(`/api/recognitions/${id}/comments`), enabled });
}
export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: string }) => api(`/api/recognitions/${v.id}/comments`, { method: "POST", body: JSON.stringify({ body: v.body }) }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["recognition-comments", v.id] }); qc.invalidateQueries({ queryKey: ["recognitions"] }); },
  });
}
export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { commentId: string; recognitionId: string }) => api(`/api/recognitions/comments/${v.commentId}`, { method: "DELETE" }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["recognition-comments", v.recognitionId] }); qc.invalidateQueries({ queryKey: ["recognitions"] }); },
  });
}

// Pickers for dept/team recipients (both endpoints are open to all authenticated users).
export function useOrgNodes() {
  return useQuery({ queryKey: ["org-nodes"], queryFn: () => api<{ nodes: { id: string; name: string; nodeType: string }[] }>("/api/org/nodes") });
}
export function useGroupsList() {
  return useQuery({ queryKey: ["groups-list"], queryFn: () => api<{ groups: { id: string; name: string; members: { id: string; name: string }[] }[] }>("/api/groups") });
}
