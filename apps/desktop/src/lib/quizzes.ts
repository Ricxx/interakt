import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Correct = { indices?: number[]; bool?: boolean; texts?: string[]; order?: number[]; value?: number; tolerance?: number; min?: number; max?: number };
export type QuizQuestion = { id: string; type: string; prompt: string; options: string[]; correct: Correct; timeLimitSec: number; points: string; mediaKind: string | null; mediaUrl: string | null };
export type QuizSummary = { id: string; title: string; questions: number };
export type QuizDetail = { quiz: { id: string; title: string; description: string | null }; questions: QuizQuestion[] };

export function useQuizzes() {
  return useQuery({ queryKey: ["quizzes"], queryFn: () => api<{ quizzes: QuizSummary[] }>("/api/quizzes") });
}
export function useQuiz(id: string) {
  return useQuery({ queryKey: ["quiz", id], queryFn: () => api<QuizDetail>(`/api/quizzes/${id}`), enabled: !!id });
}
export function useCreateQuiz() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (title: string) => api<{ quiz: { id: string } }>("/api/quizzes", { method: "POST", body: JSON.stringify({ title }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quizzes"] }) });
}
export function useCopyQuiz() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api<{ quiz: { id: string } }>(`/api/quizzes/${id}/copy`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quizzes"] }) });
}
export function useDeleteQuiz() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/quizzes/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["quizzes"] }) });
}

function useBuilder<V>(id: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: ["quiz", id] }); qc.invalidateQueries({ queryKey: ["quizzes"] }); } });
}
export const useUpdateQuiz = (id: string) => useBuilder(id, (patch: Record<string, unknown>) => api(`/api/quizzes/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
export const useAddQuizQuestion = (id: string) => useBuilder(id, (type: string) => api(`/api/quizzes/${id}/questions`, { method: "POST", body: JSON.stringify({ type }) }));
export const useUpdateQuizQuestion = (id: string) => useBuilder(id, ({ qid, ...patch }: { qid: string } & Partial<QuizQuestion>) => api(`/api/quizzes/${id}/questions/${qid}`, { method: "PATCH", body: JSON.stringify(patch) }));
export const useDeleteQuizQuestion = (id: string) => useBuilder(id, (qid: string) => api(`/api/quizzes/${id}/questions/${qid}`, { method: "DELETE" }));
export const useMoveQuizQuestion = (id: string) => useBuilder(id, ({ qid, dir }: { qid: string; dir: "up" | "down" }) => api(`/api/quizzes/${id}/questions/${qid}/move`, { method: "POST", body: JSON.stringify({ dir }) }));
