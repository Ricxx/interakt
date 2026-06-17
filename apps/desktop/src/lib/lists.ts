import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type ListSummary = { id: string; title: string; status: string; recurrence: string; scopeKind: string; scope: string; total: number; done: number; unread: boolean };
export type ListItem = { id: string; text: string; done: boolean; doneAt: string | null; comments: number };
export type ItemComment = { id: string; name: string; body: string; createdAt: string };
export type ListEvent = { id: number; action: string; detail: string | null; actorName: string; createdAt: string };
export type ListDetail = {
  list: { id: string; title: string; status: string; recurrence: string; scope: string };
  items: ListItem[];
  log: ListEvent[];
};
export type NewList = { title: string; recurrence: string; scopeKind?: string; scopeId?: string };

export function useLists() {
  return useQuery({ queryKey: ["lists"], queryFn: () => api<{ lists: ListSummary[] }>("/api/lists") });
}

export function useList(id: string) {
  return useQuery({ queryKey: ["list", id], queryFn: () => api<ListDetail>(`/api/lists/${id}`), enabled: !!id });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NewList) => api<{ list: { id: string } }>("/api/lists", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lists"] }),
  });
}

// Item mutations all refresh the open list detail + the summary counts.
function useListMutation<V>(fn: (v: V) => Promise<unknown>, listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

export function useAddItem(listId: string) {
  return useListMutation((text: string) => api(`/api/lists/${listId}/items`, { method: "POST", body: JSON.stringify({ text }) }), listId);
}
export function useToggleItem(listId: string) {
  return useListMutation((itemId: string) => api(`/api/lists/items/${itemId}/toggle`, { method: "POST" }), listId);
}
export function useToggleClose(listId: string) {
  return useListMutation(() => api(`/api/lists/${listId}/close-toggle`, { method: "POST" }), listId);
}

export function useItemComments(itemId: string, open: boolean) {
  return useQuery({
    queryKey: ["item-comments", itemId],
    queryFn: () => api<{ comments: ItemComment[] }>(`/api/lists/items/${itemId}/comments`),
    enabled: open,
  });
}

export function useAddComment(itemId: string, listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/api/lists/items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item-comments", itemId] });
      qc.invalidateQueries({ queryKey: ["list", listId] }); // refresh the comment count badge
    },
  });
}
