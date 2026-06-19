import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type TournamentListItem = { id: string; title: string; gameLabel: string | null; status: string; scope: string };
export type Throw = "ROCK" | "PAPER" | "SCISSORS";
export type BracketMatch = { id: string; slot: number; p1: string | null; p2: string | null; winner: string | null; winnerId: string | null; player1Id: string | null; player2Id: string | null; ready: boolean; scheduledAt: string | null; canPlay: boolean; myThrow: Throw | null; oppThrew: boolean };
export type Registrant = { userId: string; name: string | null; state: string };
export type TournamentDetail = {
  id: string; title: string; gameLabel: string | null; status: "SIGNUP" | "ACTIVE" | "DONE"; joinPolicy: "OPEN" | "APPLY"; requirements: string | null;
  scope: string; canManage: boolean; myState: string | null; champion: string | null;
  registrants: Registrant[]; players: { seed: number; name: string | null }[];
  rounds: { round: number; matches: BracketMatch[] }[];
};
type ScopeFields = { title: string; gameLabel?: string; scopeKind: "ALL" | "NODE" | "GROUP"; scopeId?: string | null };
export type CreateTournament =
  | ({ mode: "PICK"; playerIds: string[] } & ScopeFields)
  | ({ mode: "QUICK" } & ScopeFields)
  | ({ mode: "SIGNUP"; joinPolicy: "OPEN" | "APPLY"; requirements?: string } & ScopeFields);

export function useTournaments() {
  return useQuery({ queryKey: ["tournaments"], queryFn: () => api<{ tournaments: TournamentListItem[] }>("/api/tournaments") });
}
export function useTournament(id: string) {
  return useQuery({
    queryKey: ["tournament", id],
    queryFn: () => api<TournamentDetail>(`/api/tournaments/${id}`),
    // Poll only while the viewer has a live match, so a Rock-Paper-Scissors throw resolves without a refresh.
    refetchInterval: (q) => (q.state.data?.rounds.some((r) => r.matches.some((m) => m.canPlay)) ? 3000 : false),
  });
}
export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: CreateTournament) => api<{ id: string }>("/api/tournaments", { method: "POST", body: JSON.stringify(v) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments"] }) });
}
function action<T = void>(method: string, path: (id: string, arg: T) => string, body?: (arg: T) => object) {
  return (id: string) => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (arg: T) => api(path(id, arg), { method, ...(body ? { body: JSON.stringify(body(arg)) } : {}) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament", id] }) });
  };
}
export const useJoinTournament = action("POST", (id) => `/api/tournaments/${id}/join`);
export const useWithdraw = action("DELETE", (id) => `/api/tournaments/${id}/join`);
export const useStartTournament = action("POST", (id) => `/api/tournaments/${id}/start`);
export const useAcceptPlayer = action<string>("POST", (id, uid) => `/api/tournaments/${id}/players/${uid}/accept`);
export const useRemovePlayer = action<string>("DELETE", (id, uid) => `/api/tournaments/${id}/players/${uid}`);
export function useReportMatch(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { matchId: string; winnerId?: string; scheduledAt?: string | null }) => api(`/api/tournaments/${tournamentId}/matches/${v.matchId}`, { method: "PATCH", body: JSON.stringify({ winnerId: v.winnerId, scheduledAt: v.scheduledAt }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament", tournamentId] }),
  });
}
export function usePlayMatch(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { matchId: string; throw: Throw }) => api<{ status: string }>(`/api/tournaments/${tournamentId}/matches/${v.matchId}/play`, { method: "POST", body: JSON.stringify({ throw: v.throw }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament", tournamentId] }),
  });
}
