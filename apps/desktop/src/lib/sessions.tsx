import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Invite = { id: string; title: string; hostName: string; myState: string; state: string; joinCode: string | null; scheduledAt: string | null };

export function useHistory() {
  return useQuery({
    queryKey: ["history"],
    queryFn: () => api<{ history: { id: string; title: string; joinCode: string | null; hostName: string; endedAt: string | null; iHosted: boolean }[] }>("/api/sessions/history"),
  });
}
export type Participant = { userId: string; name: string; node: string | null; nodeId: string | null; state: string; role: string | null; accessRevoked: boolean };
export type Candidate = { id: string; name: string; node: string | null };
export type Pick = { userId: string; name: string; manual: boolean };
export type Tally = { userId: string; name: string; count: number; voters: string[] };
export type Nomination = {
  anonymous: boolean;
  showCounts: boolean;
  votingEndsAt: string | null;
  tally: Tally[];
  tallyHidden: boolean;
  myVote: string | null;
  totalVotes: number;
};
export type Idea = { id: string; title: string; body: string | null; authorName: string; createdAt: string; likes: number; likedByMe: boolean; comments: number };
export type IdeaComment = { id: string; name: string; body: string; createdAt: string };
export type CurrentActivity = {
  id: string;
  type: string;
  title: string;
  config: { removeAfterPick?: boolean; includeHost?: boolean; description?: string } | null;
  picks: Pick[];
  nomination?: Nomination;
  brainstorm?: { ideas: Idea[] };
  rps?: Rps;
  tasks?: Task[];
  taskReview?: TaskReview;
  trivia?: Trivia;
  poll?: Poll;
};

export type PollOption = { index: number; label: string; count: number };
export type Poll = {
  question: string;
  chartType: string;
  anonymity: string;
  resultsVisibility: string;
  closed: boolean;
  closeAt: string | null;
  options: PollOption[];
  totalVotes: number;
  myVote: number | null;
  showResults: boolean;
  voters: { name: string; optionIndex: number }[] | null;
  canExport: boolean;
};

export type TriviaSubmission = { format: string; prompt: string; answer: string | null; options: string[] | null; correctIndex: number | null };
export type TriviaRevealItem = { authorName: string; format: string; prompt: string; options: string[] | null; correctIndex: number | null; answer: string | null };
export type Trivia = {
  phase: "COLLECTING" | "ASSIGNED" | "REVEALED";
  deadline: string | null;
  submittedCount: number;
  joinedCount: number;
  submitters: string[];
  mySubmission: TriviaSubmission | null;
  myAssignment: { authorName: string; format: string; prompt: string; options: string[] | null } | null;
  reveal: TriviaRevealItem[] | null;
};

export type Task = { id: string; title: string; status: string; dueDate: string | null; byName: string; assignee: { id: string; name: string } | null };

export type ReviewCard = { id: string; key: string; title: string; status: string; dueDate: string | null; assignee: { id: string; name: string } | null };
export type TaskReview = {
  listNodeId: string | null;
  spotlight: (ReviewCard & { parentId: string | null; parentKey: string | null; subtasks: ReviewCard[] }) | null;
  board: { id: string; key: string; title: string; status: string; parentId: string | null }[];
};

export type RpsRound = { roundNo: number; p1Choice: string | null; p2Choice: string | null; p1Forfeit: boolean; p2Forfeit: boolean; winner: string };
export type Rps = {
  bestOf: number;
  agreementKind: string;
  agreementText: string;
  player1: { name: string };
  player2: { name: string };
  myPlayer: number | null;
  scores: { p1: number; p2: number };
  matchWinner: number | null;
  endedReason: string | null;
  currentRound: { roundNo: number; p1Locked: boolean; p2Locked: boolean; myLocked: boolean; deadline: string | null } | null;
  rounds: RpsRound[];
};

export function useAddIdea(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; body?: string }) => api(`/api/activities/${activityId}/ideas`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useLikeIdea(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => api(`/api/activities/${activityId}/ideas/${ideaId}/like`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useIdeaComments(activityId: string, ideaId: string, enabled: boolean) {
  return useQuery({ queryKey: ["idea-comments", ideaId], queryFn: () => api<{ comments: IdeaComment[] }>(`/api/activities/${activityId}/ideas/${ideaId}/comments`), enabled });
}
export function useAddComment(sessionId: string, activityId: string, ideaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/api/activities/${activityId}/ideas/${ideaId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["idea-comments", ideaId] });
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}
export type PastActivity = {
  id: string;
  type: string;
  title: string;
  startedByName: string | null;
  endedAt: string | null;
  picks: Pick[];
  nomination?: { anonymous: boolean; tally: Tally[]; winnerName: string | null };
  brainstorm?: { description: string | null; ideas: Idea[] };
  rps?: { player1Name: string; player2Name: string; scores: { p1: number; p2: number }; winnerName: string | null; loserName: string | null; byForfeit: boolean; agreementKind: string; agreementText: string };
  tasks?: Task[];
  trivia?: { authorName: string; prompt: string; options: string[] | null; correctIndex: number | null; answer: string | null }[];
  poll?: { question: string; chartType: string; total: number; options: { label: string; count: number }[] };
};
export type InviteBatch = { id: string; scopeLabel: string; count: number; byName: string | null; createdAt: string; cancelledAt: string | null; cancelReason: string | null };
export type SessionDetail = {
  session: { id: string; title: string; state: string; joinCode: string | null; joinPolicy: string; participantStart: boolean; participantTypes: string[]; scheduledAt: string | null; hostId: string; hostName: string; audience: string };
  isHost: boolean;
  isCreator: boolean;
  myRole: string | null; // HOST | COHOST | ACTIVITY_ADMIN | MEMBER | null
  canControl: boolean;
  canRunActivities: boolean;
  myState: string | null;
  participants: Participant[];
  currentActivity: CurrentActivity | null;
  pastActivities: PastActivity[];
  inviteBatches: InviteBatch[];
  events: { name: string; kind: string; at: string }[];
  agenda: AgendaItem[];
  drafts: { id: string; type: string; title: string; agendaItemId: string | null; launchAt: string | null }[];
  unreadChat: number;
};

export type AgendaItem = { id: string; title: string; time: string | null; durationMins: number | null; note: string | null; position: number; done: boolean; active: boolean };
type AgendaFields = { title?: string; time?: string | null; durationMins?: number | null; note?: string | null };

export function useAddAgendaItem(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AgendaFields & { title: string }) => api(`/api/sessions/${sessionId}/agenda`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useUpdateAgendaItem(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AgendaFields & { itemId: string; done?: boolean }) => api(`/api/sessions/${sessionId}/agenda/${v.itemId}`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useEditDraft(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { activityId: string; agendaItemId?: string | null; launchAt?: string | null }) => {
      const body: Record<string, unknown> = {};
      if (v.agendaItemId !== undefined) body.agendaItemId = v.agendaItemId;
      if (v.launchAt !== undefined) body.launchAt = v.launchAt;
      return api(`/api/activities/${v.activityId}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useAgendaItemAction(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemId: string; action: "activate" | "delete" } | { itemId: string; action: "move"; dir: "up" | "down" }) => {
      if (v.action === "delete") return api(`/api/sessions/${sessionId}/agenda/${v.itemId}`, { method: "DELETE" });
      if (v.action === "move") return api(`/api/sessions/${sessionId}/agenda/${v.itemId}/move`, { method: "POST", body: JSON.stringify({ dir: v.dir }) });
      return api(`/api/sessions/${sessionId}/agenda/${v.itemId}/activate`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useEditBrainstorm(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title?: string; description?: string }) => api(`/api/activities/${activityId}/brainstorm`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useScopePreview(sessionId: string, scope: { scopeKind: string; scopeId: string | null } | null) {
  return useQuery({
    queryKey: ["scope-preview", sessionId, scope?.scopeKind, scope?.scopeId],
    queryFn: () => api<{ count: number }>(`/api/sessions/${sessionId}/scope-preview?scopeKind=${scope!.scopeKind}${scope!.scopeId ? `&scopeId=${scope!.scopeId}` : ""}`),
    enabled: !!scope,
  });
}

export function useInviteScope(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKind: string; scopeId: string | null }) =>
      api<{ invited: number }>(`/api/sessions/${sessionId}/invite-scope`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      qc.invalidateQueries({ queryKey: ["scope-preview", sessionId] });
    },
  });
}

export function useCancelBatch(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { batchId: string; reason: string }) =>
      api(`/api/sessions/${sessionId}/invite-batches/${v.batchId}/cancel`, { method: "POST", body: JSON.stringify({ reason: v.reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useStartActivity(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { type: string; title: string; draft?: boolean; agendaItemId?: string; config?: { removeAfterPick?: boolean; includeHost?: boolean; anonymous?: boolean; timerSeconds?: number; description?: string; bestOf?: number; agreementKind?: string; agreementText?: string; player1Id?: string; player2Id?: string; pollOptions?: string[]; anonymity?: string; resultsVisibility?: string; chartType?: string; closeSeconds?: number } }) =>
      api(`/api/sessions/${sessionId}/activities`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useLaunchDraft(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) => api(`/api/activities/${activityId}/launch`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useDiscardDraft(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) => api(`/api/activities/${activityId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useActivityAction(sessionId: string, verb: "reset" | "end") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) => api(`/api/activities/${activityId}/${verb}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useVote(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { activityId: string; nomineeId: string }) =>
      api(`/api/activities/${v.activityId}/vote`, { method: "POST", body: JSON.stringify({ nomineeId: v.nomineeId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useUpdateActivityConfig(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { activityId: string; showCounts?: boolean }) =>
      api(`/api/activities/${v.activityId}/config`, { method: "PATCH", body: JSON.stringify({ showCounts: v.showCounts }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useSelectWinner(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) => api(`/api/activities/${activityId}/select-winner`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useRpsPick(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (choice: string) => api(`/api/activities/${activityId}/rps/pick`, { method: "POST", body: JSON.stringify({ choice }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

// Resolve a round whose lock-in deadline has passed (non-lockers forfeit). Safe to call from any client.
export function useRpsTimeout(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/activities/${activityId}/rps/timeout`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useAddTask(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; assigneeId?: string | null; dueDate?: string | null; parentId?: string | null }) => api(`/api/activities/${activityId}/tasks`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useUpdateTask(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; status?: string; assigneeId?: string | null }) => api(`/api/activities/${activityId}/tasks/${v.taskId}`, { method: "PATCH", body: JSON.stringify({ status: v.status, assigneeId: v.assigneeId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

// Live poll.
export function usePollVote(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (optionIndex: number) => api(`/api/activities/${activityId}/poll/vote`, { method: "POST", body: JSON.stringify({ optionIndex }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function usePollClose(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/activities/${activityId}/poll/close`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
// CSV is a file response, so fetch it directly and trigger a download.
export async function downloadPollCsv(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/poll/export`, { credentials: "include" });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `poll-${activityId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Team trivia.
export function useTriviaSubmit(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { format: string; prompt: string; answer?: string | null; options?: string[] | null; correctIndex?: number | null }) =>
      api(`/api/activities/${activityId}/trivia/submit`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useTriviaAction(sessionId: string, activityId: string, action: "close" | "reveal") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/activities/${activityId}/trivia/${action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

// Task review: focus a task for the room (null clears the spotlight).
export function useSetSpotlight(sessionId: string, activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string | null) => api(`/api/activities/${activityId}/spotlight`, { method: "POST", body: JSON.stringify({ taskId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
// Edit/remove a standing task from within a review (writes to the real board, refreshes the room).
export function useReviewSetTask(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; status?: string; assigneeId?: string | null }) => api(`/api/tasks/${v.taskId}`, { method: "PATCH", body: JSON.stringify({ status: v.status, assigneeId: v.assigneeId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}
export function useReviewDeleteTask(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

// Pick: no userId -> random; userId -> that specific person (manual).
export function usePick(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { activityId: string; userId?: string }) =>
      api(`/api/activities/${v.activityId}/pick`, {
        method: "POST",
        ...(v.userId ? { body: JSON.stringify({ userId: v.userId }) } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useJoinByCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<{ sessionId: string }>("/api/sessions/join-by-code", { method: "POST", body: JSON.stringify({ code }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-invites"] }),
  });
}

export function useHosting() {
  return useQuery({ queryKey: ["hosting"], queryFn: () => api<{ sessions: { id: string; title: string; state: string; joinCode: string | null; scheduledAt: string | null }[] }>("/api/sessions/hosting") });
}

export type Reaction = { emoji: string; count: number; mine: boolean };
export type Message = { id: string; userId: string; name: string; mine: boolean; body: string; createdAt: string; replyTo: { id: string; name: string; body: string } | null; reactions: Reaction[] };
export function useMessages(sessionId: string) {
  return useQuery({ queryKey: ["messages", sessionId], queryFn: () => api<{ messages: Message[] }>(`/api/sessions/${sessionId}/messages`), enabled: !!sessionId });
}
export function useSendMessage(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; replyToId?: string }) => api(`/api/sessions/${sessionId}/messages`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", sessionId] }),
  });
}
export function useReactToMessage(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { messageId: string; emoji: string }) => api(`/api/sessions/${sessionId}/messages/${v.messageId}/react`, { method: "POST", body: JSON.stringify({ emoji: v.emoji }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", sessionId] }),
  });
}
export function useMarkChatRead(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/sessions/${sessionId}/chat/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useReclaim(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/sessions/${sessionId}/reclaim`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useGoLive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api(`/api/sessions/${sessionId}/go-live`, { method: "POST" }),
    onSuccess: (_d, sessionId) => {
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      qc.invalidateQueries({ queryKey: ["hosting"] });
    },
  });
}

export type RecentSession = { title: string; scopeKind: string; scopeId: string | null; audience: string };
export function useRecentSessions() {
  return useQuery({ queryKey: ["recent-sessions"], queryFn: () => api<{ recent: RecentSession[] }>("/api/sessions/recent") });
}

export function useCandidates(id: string) {
  return useQuery({ queryKey: ["candidates", id], queryFn: () => api<{ people: Candidate[] }>(`/api/sessions/${id}/candidates`), enabled: !!id });
}

export function useMeInvites() {
  return useQuery({ queryKey: ["me-invites"], queryFn: () => api<{ invites: Invite[] }>("/api/me/invites") });
}

export function useSession(id: string) {
  return useQuery({ queryKey: ["session", id], queryFn: () => api<SessionDetail>(`/api/sessions/${id}`), enabled: !!id });
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; scopeKind?: string; scopeId?: string | null; scheduledAt?: string }) =>
      api<{ session: { id: string } }>("/api/sessions/start", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-invites"] });
      qc.invalidateQueries({ queryKey: ["hosting"] });
      qc.invalidateQueries({ queryKey: ["recent-sessions"] });
    },
  });
}

// Generic action against a session; refreshes that session + the invite list.
export function useSessionAction(path: (id: string) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(path(id), { method: "POST" }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["session", id] });
      qc.invalidateQueries({ queryKey: ["me-invites"] });
      qc.invalidateQueries({ queryKey: ["hosting"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

export const useJoinSession = () => useSessionAction((id) => `/api/sessions/${id}/join`);
export const useDeclineSession = () => useSessionAction((id) => `/api/sessions/${id}/decline`);
export const useLeaveSession = () => useSessionAction((id) => `/api/sessions/${id}/leave`);
export const useEndSession = () => useSessionAction((id) => `/api/sessions/${id}/end`);

export function useSetSessionRole(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: "COHOST" | "ACTIVITY_ADMIN" | "MEMBER" }) =>
      api(`/api/sessions/${sessionId}/participants/${v.userId}/role`, { method: "POST", body: JSON.stringify({ role: v.role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function usePassHost(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/api/sessions/${sessionId}/pass-host`, { method: "POST", body: JSON.stringify({ userId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useUpdateSettings(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { joinPolicy?: "OPEN" | "APPROVAL"; participantStart?: boolean; participantTypes?: string[] }) =>
      api(`/api/sessions/${sessionId}/settings`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

// Run one participant action across many people at once (reuses the per-person endpoints).
export function useBulkParticipants(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { action: "remove" | "revoke" | "reinvite" | "admit" | "deny"; userIds: string[] }) => {
      const call = (uid: string) =>
        v.action === "reinvite"
          ? api(`/api/sessions/${sessionId}/invite`, { method: "POST", body: JSON.stringify({ userId: uid }) })
          : api(`/api/sessions/${sessionId}/participants/${uid}/${v.action === "admit" ? "approve" : v.action}`, { method: "POST" });
      await Promise.all(v.userIds.map(call));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      qc.invalidateQueries({ queryKey: ["candidates", sessionId] });
    },
  });
}

export function useEntrantAction(sessionId: string, action: "approve" | "deny" | "revoke") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/api/sessions/${sessionId}/participants/${userId}/${action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
  });
}

export function useParticipantAction(verb: "remove" | "invite") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sessionId: string; userId: string }) =>
      verb === "remove"
        ? api(`/api/sessions/${v.sessionId}/participants/${v.userId}/remove`, { method: "POST" })
        : api(`/api/sessions/${v.sessionId}/invite`, { method: "POST", body: JSON.stringify({ userId: v.userId }) }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["session", v.sessionId] });
      qc.invalidateQueries({ queryKey: ["candidates", v.sessionId] });
    },
  });
}
