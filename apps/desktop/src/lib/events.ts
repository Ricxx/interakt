import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type EventKind = "PLAN" | "FUND" | "THEME_DAY";
export type EventListItem = { id: string; kind: EventKind; title: string; scopeKind: "ALL" | "NODE" | "GROUP"; scope: string; startAt: string | null; endAt: string | null; goalAmount: number | null; mine: boolean };
export type EventDetail = { id: string; kind: EventKind; title: string; instructions: string | null; scope: string; startAt: string | null; endAt: string | null; goalAmount: number | null; galleryAnon: boolean; list: { id: string; title: string } | null; canManage: boolean };
export type Photo = { id: string; number: number; url: string; caption: string | null; byName: string; mine: boolean; canDelete: boolean; likes: number; likedByMe: boolean; comments: number; likers: string[] };
export type PhotoComment = { id: string; body: string; parentId: string | null; createdAt: string; authorId: string; authorName: string; canDelete: boolean };
export type Contributions = { goal: number | null; total: number; mine: number; count: number; contributions: { name: string; amount: number; note: string | null; day: string }[] };

export type CreateEvent = { kind: EventKind; title: string; instructions?: string; scopeKind: "ALL" | "NODE" | "GROUP"; scopeId?: string | null; startAt?: string | null; endAt?: string | null; goalAmount?: number | null; galleryAnon?: boolean; listId?: string };

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: () => api<{ events: EventListItem[] }>("/api/events") });
}
export function useEvent(id: string) {
  return useQuery({ queryKey: ["event", id], queryFn: () => api<EventDetail>(`/api/events/${id}`) });
}
export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: CreateEvent) => api<{ id: string }>("/api/events", { method: "POST", body: JSON.stringify(v) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }) });
}
export function useToggleGalleryAnon(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (galleryAnon: boolean) => api(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ galleryAnon }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }) });
}
export function useImportIcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ics: string) => api<{ imported: number; skipped: number }>("/api/events/import-ics", { method: "POST", body: JSON.stringify({ ics }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
export function useUploadToken(id: string, enabled: boolean) {
  return useQuery({ queryKey: ["upload-token", id], queryFn: () => api<{ token: string; url: string }>(`/api/events/${id}/upload-token`), enabled });
}
export function useAttachList(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (listId: string | null) => api(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ listId }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }) });
}

export function useContributions(id: string, enabled: boolean) {
  return useQuery({ queryKey: ["event-contributions", id], queryFn: () => api<Contributions>(`/api/events/${id}/contributions`), enabled });
}
export function useContribute(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { amount: number; note?: string }) => api(`/api/events/${id}/contributions`, { method: "POST", body: JSON.stringify(v) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["event-contributions", id] }) });
}

export function usePhotos(id: string) {
  return useQuery({ queryKey: ["event-photos", id], queryFn: () => api<{ anon: boolean; photos: Photo[] }>(`/api/events/${id}/photos`) });
}
export function useAddPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { url: string; caption?: string }) => api(`/api/events/${id}/photos`, { method: "POST", body: JSON.stringify(v) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["event-photos", id] }) });
}
export function useDeletePhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (photoId: string) => api(`/api/events/photos/${photoId}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["event-photos", id] }) });
}
export function useTogglePhotoLike(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (photoId: string) => api(`/api/events/photos/${photoId}/like`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["event-photos", id] }) });
}
export function usePhotoComments(photoId: string, enabled: boolean) {
  return useQuery({ queryKey: ["photo-comments", photoId], queryFn: () => api<{ comments: PhotoComment[] }>(`/api/events/photos/${photoId}/comments`), enabled });
}
export function useAddPhotoComment(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { photoId: string; body: string; parentId?: string }) => api(`/api/events/photos/${v.photoId}/comments`, { method: "POST", body: JSON.stringify({ body: v.body, parentId: v.parentId }) }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["photo-comments", v.photoId] }); qc.invalidateQueries({ queryKey: ["event-photos", eventId] }); },
  });
}
export function useDeletePhotoComment(eventId: string, photoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api(`/api/events/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photo-comments", photoId] }); qc.invalidateQueries({ queryKey: ["event-photos", eventId] }); },
  });
}
