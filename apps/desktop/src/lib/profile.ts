import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type ProfileReceived = { id: string; kind: "BIGUP" | "AWARD"; badge: string; message: string; createdAt: string; fromName: string; scope: string; likes: number };
export type Profile = { id: string; name: string; jobTitle: string | null; dept: string | null; role: string; received: ProfileReceived[]; totalReceived: number; totalStars: number };

export function useProfile(id: string | null) {
  return useQuery({ queryKey: ["profile", id], queryFn: () => api<Profile>(`/api/profile/${id}`), enabled: !!id });
}
