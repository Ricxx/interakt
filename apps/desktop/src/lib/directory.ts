import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Person = { id: string; name: string; jobTitle: string | null; avatarUrl: string | null; statusText: string | null; flair: string | null; nodeId: string | null; dept: string | null };
export type Directory = { people: Person[]; departments: { id: string; name: string }[] };

export function useDirectory() {
  return useQuery({ queryKey: ["directory"], queryFn: () => api<Directory>("/api/directory") });
}
