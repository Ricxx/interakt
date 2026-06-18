import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type MyTask = {
  id: string;
  key: string;
  title: string;
  status: string;
  dueDate: string | null;
  byName: string;
  listName: string;
  sessionTitle: string | null;
  assignee: { id: string; name: string } | null;
  assignedToMe: boolean;
  parentId: string | null;
  parentKey: string | null;
  subtaskCount: number;
};

export function dueLabel(d: string | null): string {
  if (!d) return "";
  return new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Colour a due date: overdue = red, due within 2 days = amber, else muted.
export function dueClass(d: string | null): string {
  if (!d) return "";
  const due = new Date(d + "T00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return "text-red-600 font-medium";
  const soon = new Date(today);
  soon.setDate(today.getDate() + 2);
  return due <= soon ? "text-amber-600" : "text-muted";
}

export function useMyTasks() {
  return useQuery({ queryKey: ["my-tasks"], queryFn: () => api<{ tasks: MyTask[] }>("/api/tasks/mine") });
}

// "N task updates by others since you looked" → drives the To-do nav badge.
export function useTasksUnread() {
  return useQuery({ queryKey: ["tasks-unread"], queryFn: () => api<{ count: number }>("/api/tasks/unread") });
}
export function useMarkTasksRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/tasks/read", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks-unread"] }),
  });
}

export type TaskEvent = { id: string; actorName: string; action: string; taskKey: string; relatedKey: string | null; at: string };

export function useTaskFeed(limit?: number) {
  return useQuery({ queryKey: ["task-feed", limit ?? 30], queryFn: () => api<{ events: TaskEvent[] }>(`/api/tasks/feed?limit=${limit ?? 30}`) });
}

const VERB: Record<string, string> = { created: "added", updated: "updated", completed: "completed", removed: "removed" };
export function taskEventText(e: TaskEvent): string {
  return `${e.actorName} ${VERB[e.action] ?? e.action} ${e.taskKey}${e.relatedKey ? ` and related ${e.relatedKey}` : ""}`;
}
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function useTaskPeople() {
  return useQuery({ queryKey: ["task-people"], queryFn: () => api<{ people: { id: string; name: string }[] }>("/api/tasks/people") });
}

export function useAddMyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; assigneeId?: string | null; dueDate?: string | null; parentId?: string | null }) => api("/api/tasks", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-tasks"] }); qc.invalidateQueries({ queryKey: ["task-feed"] }); },
  });
}

export function useUpdateMyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; status?: string; assigneeId?: string | null; title?: string; dueDate?: string | null; parentId?: string | null }) =>
      api(`/api/tasks/${v.taskId}`, { method: "PATCH", body: JSON.stringify({ status: v.status, assigneeId: v.assigneeId, title: v.title, dueDate: v.dueDate, parentId: v.parentId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-tasks"] }); qc.invalidateQueries({ queryKey: ["task-feed"] }); },
  });
}

export function useDeleteMyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-tasks"] }); qc.invalidateQueries({ queryKey: ["task-feed"] }); },
  });
}
