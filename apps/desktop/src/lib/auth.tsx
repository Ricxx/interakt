import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Me = { email: string; displayName: string; role: string };

// The current user. `null` (not undefined) once we know they're logged out.
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const { user } = await api<{ user: Me }>("/api/auth/me");
        return user;
      } catch {
        return null;
      }
    },
  });
}

// Fresh install? Then the login screen shows "create the admin account" instead.
// Always refetch on mount so a reload reflects the real server state (not a stale cache).
export function useBootstrapStatus() {
  return useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: () => api<{ needsSetup: boolean }>("/api/auth/bootstrap-status"),
    refetchOnMount: "always",
  });
}

function useAuthMutation<T>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export const useLogin = () => useAuthMutation<{ email: string; password: string }>("/api/auth/login");

export const useRegister = () =>
  useAuthMutation<{ companyName: string; displayName: string; email: string; password: string }>(
    "/api/auth/register",
  );

export const useAcceptInvite = () =>
  useAuthMutation<{ token: string; displayName: string; password: string }>("/api/invite/accept");

// Password reset — plain mutations (no session change).
export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      api("/api/auth/forgot", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api("/api/auth/reset", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

// --- Members (admin) ---

export type Member = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  nodeId: string | null;
  node: string | null;
};
export type Pending = { id: string; email: string; role: string; createdAt: string };

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/members/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/members/invites/${id}/resend`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useAssignNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nodeId }: { id: string; nodeId: string | null }) =>
      api(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify({ nodeId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}

export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: () => api<{ members: Member[]; pending: Pending[]; registrationMode: string }>("/api/members"),
  });
}

export function useSetRegistrationMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "INVITE_ONLY" | "OPEN") => api("/api/members/registration-mode", { method: "POST", body: JSON.stringify({ mode }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}
export function useReviewMember(action: "approve" | "reject") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/members/${id}/${action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

// Public: is open self-registration on, and the self-register call.
export function useRegistrationOpen() {
  return useQuery({ queryKey: ["registration-open"], queryFn: () => api<{ open: boolean }>("/api/auth/registration") });
}
export function useRegisterOpen() {
  return useMutation({ mutationFn: (v: { displayName: string; email: string; password: string }) => api<{ ok: boolean }>("/api/auth/register-open", { method: "POST", body: JSON.stringify(v) }) });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: string }) =>
      api("/api/members/invite", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useInviteInfo(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      try {
        return await api<{ email: string }>(`/api/invite/${token}`);
      } catch {
        return null;
      }
    },
    enabled: !!token,
  });
}
