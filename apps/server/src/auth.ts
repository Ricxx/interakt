import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { env } from "./env.js";

export const SESSION_COOKIE = "ces_session";

export type CurrentUser = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
};

// Make req.currentUser available everywhere (set by the loadUser hook below).
declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
  }
}

async function getUserById(id: string): Promise<CurrentUser | null> {
  const [u] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!u || u.status !== "ACTIVE") return null;
  return { id: u.id, tenantId: u.tenantId, email: u.email, displayName: u.displayName, role: u.role };
}

/** Reads + verifies the signed session cookie and loads the user (or null). */
export async function getUserFromRequest(req: FastifyRequest): Promise<CurrentUser | null> {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const result = req.unsignCookie(raw);
  if (!result.valid || !result.value) return null;
  return getUserById(result.value);
}

/** Global preHandler: loads the user onto the request. */
export async function loadUser(req: FastifyRequest): Promise<void> {
  req.currentUser = await getUserFromRequest(req);
}

export function setSession(reply: FastifyReply, userId: string): void {
  reply.setCookie(SESSION_COOKIE, userId, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd, // requires HTTPS in production
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** preHandler: 401 if not logged in. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.currentUser) await reply.code(401).send({ error: "not_authenticated" });
}

/** preHandler factory: 401 if logged out, 403 if missing the role. */
export function requireRole(role: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.currentUser) return void (await reply.code(401).send({ error: "not_authenticated" }));
    if (req.currentUser.role !== role) await reply.code(403).send({ error: "forbidden" });
  };
}
