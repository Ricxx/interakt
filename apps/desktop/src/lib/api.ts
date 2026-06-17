// One tiny fetch wrapper. Sends cookies, throws on non-2xx. Don't grow this into a
// "client SDK" — add to it only when a real call needs something it can't do.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON body when there actually is one — Fastify rejects an empty
  // body sent with Content-Type: application/json (breaks bodyless POSTs).
  const headers: Record<string, string> = init?.body != null ? { "Content-Type": "application/json" } : {};
  const res = await fetch(path, {
    credentials: "include",
    headers: { ...headers, ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "request_failed");
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
