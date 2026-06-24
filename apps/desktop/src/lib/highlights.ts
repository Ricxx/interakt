import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Highlight = { id: string; kind: "RECOGNITION" | "ACHIEVEMENT" | "EVENT"; icon: string; title: string; body: string; at: string };

export function useHighlights() {
  return useQuery({ queryKey: ["highlights"], queryFn: () => api<{ items: Highlight[] }>("/api/highlights") });
}
