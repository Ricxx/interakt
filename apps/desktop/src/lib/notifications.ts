import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Notif = { id: string; kind: "GIFT" | "RECOGNITION" | "ACHIEVEMENT"; icon: string; title: string; body: string; at: string };

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: Notif[]; unread: number; lastSeenAt: string }>("/api/notifications") });
}
// Just the bell count — polled at a low cadence (a "you got a gift/kudos" nudge isn't urgent).
export function useNotificationsUnread() {
  return useQuery({ queryKey: ["notifications-unread"], queryFn: () => api<{ count: number }>("/api/notifications/unread"), refetchInterval: 45_000 });
}
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/notifications/read", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications-unread"] }); qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });
}
