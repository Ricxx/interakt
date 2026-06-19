import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// COLOR augment tokens → hex, for the name + avatar ring (mirrors the server's COLOR_TOKENS palette).
export const NAME_COLORS: Record<string, string> = { rose: "#e11d48", amber: "#d97706", emerald: "#059669", sky: "#0284c7", violet: "#7c3aed", slate: "#475569" };

export type ProfileReceived = { id: string; kind: "BIGUP" | "AWARD"; badge: string; message: string; createdAt: string; fromName: string; scope: string; likes: number };
export type Profile = { id: string; name: string; jobTitle: string | null; dept: string | null; role: string; avatarUrl: string | null; statusText: string | null; hobbies: string | null; highSchool: string | null; flair: string | null; title: string | null; nameColor: string | null; isMe: boolean; streak: number; achievements: { name: string; icon: string | null; category: string | null }[]; received: ProfileReceived[]; totalReceived: number; totalStars: number };
export type Augments = { owned: { FLAIR: string[]; TITLE: string[]; COLOR: string[] }; equipped: { flair: string | null; title: string | null; nameColor: string | null } };

export function useProfile(id: string | null) {
  return useQuery({ queryKey: ["profile", id], queryFn: () => api<Profile>(`/api/profile/${id}`), enabled: !!id });
}
export function useMyAugments() {
  return useQuery({ queryKey: ["my-augments"], queryFn: () => api<Augments>("/api/profile/augments") });
}
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { statusText?: string | null; hobbies?: string | null; highSchool?: string | null; avatarUrl?: string | null; flair?: string | null; title?: string | null; nameColor?: string | null }) => api("/api/profile/me", { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries({ queryKey: ["my-augments"] }); },
  });
}
