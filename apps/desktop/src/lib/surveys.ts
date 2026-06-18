import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type SurveySummary = { id: string; title: string; status: string; anonymity: string; questions: number };
export type SQuestion = { id: string; sectionId: string | null; type: string; prompt: string; options: string[]; required: boolean; allowOther: boolean };
export type SurveySection = { id: string; title: string; showToTakers: boolean };
export type Collaborator = { id: string; name: string };
export type SurveyEdit = { id: number; action: string; detail: string | null; actorName: string; createdAt: string };
export type ScopeRef = { kind: string; id: string };
export type SurveyDetail = {
  survey: { id: string; title: string; description: string | null; anonymity: string; perPage: number; status: string; scopeKind: string | null; scopeId: string | null; exclusions: ScopeRef[]; scopeLabel: string | null; isOwner: boolean };
  sections: SurveySection[];
  questions: SQuestion[];
  collaborators: Collaborator[];
};
export type AssignedSurvey = { id: string; title: string; anonymity: string; questions: number };

export function useAssignedSurveys() {
  return useQuery({ queryKey: ["surveys-assigned"], queryFn: () => api<{ surveys: AssignedSurvey[] }>("/api/surveys/assigned") });
}

export function useSurveys() {
  return useQuery({ queryKey: ["surveys"], queryFn: () => api<{ surveys: SurveySummary[] }>("/api/surveys") });
}
export function useSurvey(id: string) {
  return useQuery({ queryKey: ["survey", id], queryFn: () => api<SurveyDetail>(`/api/surveys/${id}`), enabled: !!id });
}

export function useCreateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api<{ survey: { id: string } }>("/api/surveys", { method: "POST", body: JSON.stringify({ title }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });
}
export function useCopySurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ survey: { id: string } }>(`/api/surveys/${id}/copy`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });
}
export function useDeleteSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/surveys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });
}

// Builder mutations all refresh the open survey + the list.
function useBuilderMutation<V>(id: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["survey", id] }); qc.invalidateQueries({ queryKey: ["surveys"] }); },
  });
}
export const useUpdateSurvey = (id: string) => useBuilderMutation(id, (patch: Record<string, unknown>) => api(`/api/surveys/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));

// Lifecycle: launch / pause / resume / close. Refreshes the survey, the list, and the assigned list.
export function useSurveyAction(id: string, verb: "launch" | "pause" | "resume" | "close") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/surveys/${id}/${verb}`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["survey", id] }); qc.invalidateQueries({ queryKey: ["surveys"] }); qc.invalidateQueries({ queryKey: ["surveys-assigned"] }); },
  });
}
export const useAddQuestion = (id: string) => useBuilderMutation(id, (q: Partial<SQuestion>) => api(`/api/surveys/${id}/questions`, { method: "POST", body: JSON.stringify(q) }));
export const useUpdateQuestion = (id: string) => useBuilderMutation(id, ({ qid, ...patch }: { qid: string } & Partial<SQuestion>) => api(`/api/surveys/${id}/questions/${qid}`, { method: "PATCH", body: JSON.stringify(patch) }));
export const useDeleteQuestion = (id: string) => useBuilderMutation(id, (qid: string) => api(`/api/surveys/${id}/questions/${qid}`, { method: "DELETE" }));
export const useMoveQuestion = (id: string) => useBuilderMutation(id, ({ qid, dir }: { qid: string; dir: "up" | "down" }) => api(`/api/surveys/${id}/questions/${qid}/move`, { method: "POST", body: JSON.stringify({ dir }) }));

export const useAddSection = (id: string) => useBuilderMutation(id, (v: { title: string; showToTakers?: boolean }) => api(`/api/surveys/${id}/sections`, { method: "POST", body: JSON.stringify(v) }));
export const useUpdateSection = (id: string) => useBuilderMutation(id, ({ sid, ...patch }: { sid: string } & Partial<SurveySection>) => api(`/api/surveys/${id}/sections/${sid}`, { method: "PATCH", body: JSON.stringify(patch) }));
export const useDeleteSection = (id: string) => useBuilderMutation(id, (sid: string) => api(`/api/surveys/${id}/sections/${sid}`, { method: "DELETE" }));

export const useAddCollaborator = (id: string) => useBuilderMutation(id, (email: string) => api(`/api/surveys/${id}/collaborators`, { method: "POST", body: JSON.stringify({ email }) }));
export const useRemoveCollaborator = (id: string) => useBuilderMutation(id, (userId: string) => api(`/api/surveys/${id}/collaborators/${userId}`, { method: "DELETE" }));

export function useSurveyEdits(id: string, open: boolean) {
  return useQuery({ queryKey: ["survey-edits", id], queryFn: () => api<{ edits: SurveyEdit[] }>(`/api/surveys/${id}/edits`), enabled: open });
}

// --- Responding ---
export type AnswerValue = { choice?: number; choices?: number[]; text?: string; scale?: number; other?: string };
export type RespondData = {
  survey: { id: string; title: string; description: string | null; anonymity: string; perPage: number };
  sectionTitles: Record<string, string>;
  questions: SQuestion[];
  response: { status: string; page: number; answers: { questionId: string; value: AnswerValue }[] } | null;
};

export function useRespond(id: string, ticket: string | null) {
  return useQuery({ queryKey: ["respond", id, ticket], queryFn: () => api<RespondData>(`/api/surveys/${id}/respond${ticket ? `?ticket=${ticket}` : ""}`), enabled: !!id });
}
export function useSaveResponse(id: string) {
  return useMutation({ mutationFn: (v: { ticket?: string; page: number; answers: { questionId: string; value: AnswerValue }[] }) => api<{ ok: boolean; ticket?: string }>(`/api/surveys/${id}/respond/save`, { method: "POST", body: JSON.stringify(v) }) });
}
export function useSubmitResponse(id: string) {
  return useMutation({ mutationFn: (ticket?: string) => api<{ ok: boolean }>(`/api/surveys/${id}/respond/submit`, { method: "POST", body: JSON.stringify({ ticket }) }) });
}

// --- Results ---
export type QResult = { id: string; type: string; prompt: string; options: string[]; answered: number; counts?: number[]; otherTexts?: string[]; otherCount?: number; dist?: number[]; average?: number | null; texts?: string[] };
export type SurveyResults = { anonymity: string; submitted: number; locked: boolean; k?: number; questions?: QResult[] };

export function useSurveyResults(id: string) {
  return useQuery({ queryKey: ["survey-results", id], queryFn: () => api<SurveyResults>(`/api/surveys/${id}/results`), enabled: !!id });
}

// --- Insights ---
export type Insight = { id: string; surveyId: string; surveyTitle: string; title: string; body: string; published: boolean; byName: string; createdAt: string };
export type SurveyInsight = { id: string; title: string; body: string; published: boolean; createdAt: string };

export function useInsights() {
  return useQuery({ queryKey: ["insights"], queryFn: () => api<{ insights: Insight[] }>("/api/insights") });
}
export function useSurveyInsights(surveyId: string) {
  return useQuery({ queryKey: ["survey-insights", surveyId], queryFn: () => api<{ isOwner: boolean; insights: SurveyInsight[] }>(`/api/surveys/${surveyId}/insights`), enabled: !!surveyId });
}
function useInsightMutation<V>(surveyId: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: ["survey-insights", surveyId] }); qc.invalidateQueries({ queryKey: ["insights"] }); } });
}
export const useCreateInsight = (surveyId: string) => useInsightMutation(surveyId, (v: { title: string; body?: string }) => api(`/api/surveys/${surveyId}/insights`, { method: "POST", body: JSON.stringify(v) }));
export const useUpdateInsight = (surveyId: string) => useInsightMutation(surveyId, ({ insId, ...patch }: { insId: string } & Partial<SurveyInsight>) => api(`/api/insights/${insId}`, { method: "PATCH", body: JSON.stringify(patch) }));
export const useDeleteInsight = (surveyId: string) => useInsightMutation(surveyId, (insId: string) => api(`/api/insights/${insId}`, { method: "DELETE" }));

// Stream the CSV export and save it (the endpoint is owner-only + audited).
export async function downloadSurveyCsv(id: string) {
  const res = await fetch(`/api/surveys/${id}/results.csv`, { credentials: "include" });
  if (!res.ok) throw new Error("export_failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `survey-${id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
