import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Idea, IdeaComment } from "./sessions";

export type BoardSummary = { id: string; type: string; title: string; description: string | null; scope: string; items: number };
export type NoticePost = { id: string; title: string; body: string | null; authorName: string; activeUntil: string | null; archived: boolean; comments: number; createdAt: string };
export type BoardDetail = { board: { id: string; type: string; title: string; description: string | null; scope: string }; ideas?: Idea[]; posts?: NoticePost[] };

export function useBoards() {
  return useQuery({ queryKey: ["boards"], queryFn: () => api<{ boards: BoardSummary[] }>("/api/boards") });
}
export function useBoard(id: string) {
  return useQuery({ queryKey: ["board", id], queryFn: () => api<BoardDetail>(`/api/boards/${id}`), enabled: !!id });
}
export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { type: string; title: string; description?: string; scopeKind: string; scopeId: string | null }) => api<{ board: { id: string } }>("/api/boards", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}
export function useAddBoardIdea(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; body?: string }) => api(`/api/boards/${boardId}/ideas`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}
export function useLikeBoardIdea(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => api(`/api/boards/${boardId}/ideas/${ideaId}/like`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}
export function useBoardIdeaComments(boardId: string, ideaId: string, enabled: boolean) {
  return useQuery({ queryKey: ["board-comments", ideaId], queryFn: () => api<{ comments: IdeaComment[] }>(`/api/boards/${boardId}/ideas/${ideaId}/comments`), enabled });
}
// --- NOTICE posts ---
export function usePostNotice(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; body?: string; activeUntil?: string }) => api(`/api/boards/${boardId}/posts`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });
}
export function useNoticeComments(boardId: string, postId: string, enabled: boolean) {
  return useQuery({ queryKey: ["board-comments", postId], queryFn: () => api<{ comments: IdeaComment[] }>(`/api/boards/${boardId}/posts/${postId}/comments`), enabled });
}
export function useAddNoticeComment(boardId: string, postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/api/boards/${boardId}/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-comments", postId] });
      qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });
}

export function useAddBoardComment(boardId: string, ideaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/api/boards/${boardId}/ideas/${ideaId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-comments", ideaId] });
      qc.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });
}
