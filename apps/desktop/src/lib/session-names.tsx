import { useCallback, useState } from "react";

// Remembered session names — stored in localStorage, so they're per device + account
// (never sent to the server, never shared between users). Add as used, remove freely.
export function useLocalSessionNames(account: string) {
  const key = `ces.sessionNames.${account}`;
  const read = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  };
  const [names, setNames] = useState<string[]>(read);

  const persist = useCallback(
    (next: string[]) => {
      localStorage.setItem(key, JSON.stringify(next));
      setNames(next);
    },
    [key],
  );

  const add = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      const cur = read();
      if (cur.includes(n)) return;
      persist([n, ...cur].slice(0, 20));
    },
    [persist],
  );

  const remove = useCallback((name: string) => persist(read().filter((x) => x !== name)), [persist]);

  return { names, add, remove };
}
