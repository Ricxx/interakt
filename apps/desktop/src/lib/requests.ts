import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type RequestItem = {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  requiredApprovals: number;
  approvals: number;
  iApproved: boolean;
  createdBy: string;
  subjectUserId: string | null;
  createdAt: string;
  groupName: string | null;
  subjectName: string | null;
  creatorName: string | null;
};

export function useRequests() {
  return useQuery({ queryKey: ["requests"], queryFn: () => api<{ isApprover: boolean; mine: RequestItem[]; queue: RequestItem[] }>("/api/requests") });
}
export function useGroupList() {
  return useQuery({ queryKey: ["group-list"], queryFn: () => api<{ groups: { id: string; name: string; level: number }[] }>("/api/permission-groups/list") });
}
export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: "PERMISSION_GRANT"; groupId: string } | { kind: "GENERIC"; title: string }) => api("/api/requests", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
}
export function useReviewRequest(action: "approve" | "reject") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/requests/${id}/${action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
}
