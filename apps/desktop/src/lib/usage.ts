import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type UsageSession = { id: string; title: string; day: string; people: string[]; activities: string[] };
export type Usage = { enabled: boolean; reach?: "ALL" | "NODE"; sessions: UsageSession[] };

export function useUsageAccess() {
  return useQuery({ queryKey: ["usage-access"], queryFn: () => api<{ canView: boolean; enabled: boolean }>("/api/usage/access") });
}
export function useUsage(enabled: boolean) {
  return useQuery({ queryKey: ["usage"], queryFn: () => api<Usage>("/api/usage"), enabled });
}

// Activity type → friendly label (mirrors the session activity catalog; usage shows TYPE only, no content).
const LABELS: Record<string, string> = {
  RANDOMIZER: "Randomizer", NOMINATION: "Nomination", BRAINSTORM: "Brainstorm", RPS: "Rock Paper Scissors",
  TASKS: "Tasks", TASK_REVIEW: "Task review", TRIVIA: "Trivia", POLL: "Poll", WORDCLOUD: "Word cloud",
  DRAW_STRAWS: "Draw straws", TEAM_SELECT: "Team selector", SURVEY: "Survey", QUIZ: "Quiz",
  TIC_TAC_TOE: "Tic-tac-toe", CONNECT_FOUR: "Connect four", CHECKERS: "Checkers",
};
export const activityLabel = (t: string) => LABELS[t] ?? t;
