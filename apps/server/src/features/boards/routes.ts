import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { boards, boardPosts, boardPostComments, brainstormIdeas, brainstormLikes, brainstormComments, groups, orgNodes, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { listIdeas } from "../../lib/ideas.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";
import { can, isGoverned } from "../../lib/capabilities.js";
import { peopleInScope } from "../../lib/scope.js";
import { hub } from "../../lib/realtime.js";

// Who can pin a notice: the board's creator/admin always; otherwise governed users with the
// pin capability for the board's scope. Ungoverned non-creators can't pin (keeps it curated).
async function canPin(user: { id: string; tenantId: string; role: string }, board: { createdBy: string; scopeKind: string; scopeId: string | null }): Promise<boolean> {
  if (user.role === "TENANT_ADMIN" || board.createdBy === user.id) return true;
  if (!(await isGoverned(user.id))) return false;
  return can(user, "pin", board.scopeKind === "NODE" ? board.scopeId ?? undefined : undefined);
}

const createBody = z.object({
  type: z.enum(["NOTICE", "BRAINSTORM"]),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  scopeKind: z.enum(["ALL", "NODE", "GROUP"]),
  scopeId: z.string().uuid().nullable().optional(),
});

// Board the user is allowed to see, or null.
async function accessibleBoard(boardId: string, userId: string, tenantId: string) {
  const [b] = await db.select().from(boards).where(eq(boards.id, boardId));
  if (!b || !(await canSeeScoped(b, userId, tenantId))) return null;
  return b;
}

// Realtime: nudge everyone who can see this board to refetch.
async function notifyBoard(board: { id: string; tenantId: string; scopeKind: string; scopeId: string | null }) {
  const people = await peopleInScope(board.tenantId, board.scopeKind as "ALL" | "NODE" | "GROUP", board.scopeId);
  hub.sendToUsers(people.map((p) => p.id), { type: "board.update", boardId: board.id });
}

export function boardRoutes(app: FastifyInstance) {
  // Boards the user can see (scoped by hierarchy / group).
  app.get("/api/boards", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const all = await db.select().from(boards).where(eq(boards.tenantId, me.tenantId)).orderBy(desc(boards.createdAt));
    const visible = [];
    for (const b of all) if (await canSeeScoped(b, me.id, me.tenantId)) visible.push(b);

    const ids = visible.map((b) => b.id);
    const ideaRows = ids.length ? await db.select({ boardId: brainstormIdeas.boardId }).from(brainstormIdeas).where(inArray(brainstormIdeas.boardId, ids)) : [];
    const postRows = ids.length ? await db.select({ boardId: boardPosts.boardId }).from(boardPosts).where(inArray(boardPosts.boardId, ids)) : [];
    const count = new Map<string, number>();
    for (const r of [...ideaRows, ...postRows]) if (r.boardId) count.set(r.boardId, (count.get(r.boardId) ?? 0) + 1);

    const out = await Promise.all(
      visible.map(async (b) => ({ id: b.id, type: b.type, title: b.title, description: b.description, scope: await scopeLabel(me.tenantId, b.scopeKind, b.scopeId), items: count.get(b.id) ?? 0 })),
    );
    return { boards: out };
  });

  app.post("/api/boards", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const [b] = await db
      .insert(boards)
      .values({ tenantId: req.currentUser!.tenantId, type: parsed.data.type, title: parsed.data.title, description: parsed.data.description ?? null, scopeKind: parsed.data.scopeKind, scopeId: parsed.data.scopeId ?? null, createdBy: req.currentUser!.id })
      .returning();
    return { board: { id: b.id } };
  });

  app.get<{ Params: { id: string } }>("/api/boards/:id", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const b = await accessibleBoard(req.params.id, me.id, me.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    const base = { board: { id: b.id, type: b.type, title: b.title, description: b.description, scope: await scopeLabel(me.tenantId, b.scopeKind, b.scopeId), canPin: await canPin(me, b) } };
    if (b.type === "NOTICE") return { ...base, posts: await noticePosts(b.id) };
    return { ...base, ideas: await listIdeas({ boardId: b.id }, me.id) };
  });

  // --- NOTICE posts ---
  app.post<{ Params: { id: string } }>("/api/boards/:id/posts", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), body: z.string().max(4000).optional(), activeUntil: z.string().datetime().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b || b.type !== "NOTICE") return reply.code(404).send({ error: "not_found" });
    await db.insert(boardPosts).values({ boardId: b.id, authorId: req.currentUser!.id, title: body.data.title, body: body.data.body ?? null, activeUntil: body.data.activeUntil ? new Date(body.data.activeUntil) : null });
    await notifyBoard(b);
    return { ok: true };
  });

  // Pin / unpin a notice (board owner / admin, or someone with the pin capability for its scope).
  app.post<{ Params: { id: string; postId: string } }>("/api/boards/:id/posts/:postId/pin", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const b = await accessibleBoard(req.params.id, me.id, me.tenantId);
    if (!b || b.type !== "NOTICE") return reply.code(404).send({ error: "not_found" });
    if (!(await canPin(me, b))) return reply.code(403).send({ error: "not_allowed" });
    const [p] = await db.select({ id: boardPosts.id, pinned: boardPosts.pinned }).from(boardPosts).where(and(eq(boardPosts.id, req.params.postId), eq(boardPosts.boardId, b.id)));
    if (!p) return reply.code(404).send({ error: "not_found" });
    await db.update(boardPosts).set({ pinned: !p.pinned }).where(eq(boardPosts.id, p.id));
    await notifyBoard(b);
    return { ok: true };
  });

  app.get<{ Params: { id: string; postId: string } }>("/api/boards/:id/posts/:postId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    const rows = await db
      .select({ id: boardPostComments.id, name: users.displayName, body: boardPostComments.body, createdAt: boardPostComments.createdAt })
      .from(boardPostComments)
      .innerJoin(users, eq(users.id, boardPostComments.userId))
      .where(eq(boardPostComments.postId, req.params.postId))
      .orderBy(boardPostComments.createdAt);
    return { comments: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });

  app.post<{ Params: { id: string; postId: string } }>("/api/boards/:id/posts/:postId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ body: z.string().min(1).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    await db.insert(boardPostComments).values({ postId: req.params.postId, userId: req.currentUser!.id, body: body.data.body });
    await notifyBoard(b);
    return { ok: true };
  });

  // --- BRAINSTORM ideas (existing type) ---
  app.post<{ Params: { id: string } }>("/api/boards/:id/ideas", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().min(1).max(200), body: z.string().max(2000).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    await db.insert(brainstormIdeas).values({ boardId: b.id, userId: req.currentUser!.id, title: body.data.title, body: body.data.body ?? null });
    await notifyBoard(b);
    return { ok: true };
  });

  app.post<{ Params: { id: string; ideaId: string } }>("/api/boards/:id/ideas/:ideaId/like", { preHandler: requireAuth }, async (req, reply) => {
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    const me = req.currentUser!.id;
    const where = and(eq(brainstormLikes.ideaId, req.params.ideaId), eq(brainstormLikes.userId, me));
    const [existing] = await db.select().from(brainstormLikes).where(where);
    if (existing) await db.delete(brainstormLikes).where(where);
    else await db.insert(brainstormLikes).values({ ideaId: req.params.ideaId, userId: me }).onConflictDoNothing();
    await notifyBoard(b);
    return { ok: true };
  });

  app.get<{ Params: { id: string; ideaId: string } }>("/api/boards/:id/ideas/:ideaId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    const rows = await db
      .select({ id: brainstormComments.id, name: users.displayName, body: brainstormComments.body, createdAt: brainstormComments.createdAt })
      .from(brainstormComments)
      .innerJoin(users, eq(users.id, brainstormComments.userId))
      .where(eq(brainstormComments.ideaId, req.params.ideaId))
      .orderBy(brainstormComments.createdAt);
    return { comments: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });

  app.post<{ Params: { id: string; ideaId: string } }>("/api/boards/:id/ideas/:ideaId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ body: z.string().min(1).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const b = await accessibleBoard(req.params.id, req.currentUser!.id, req.currentUser!.tenantId);
    if (!b) return reply.code(404).send({ error: "not_found" });
    await db.insert(brainstormComments).values({ ideaId: req.params.ideaId, userId: req.currentUser!.id, body: body.data.body });
    await notifyBoard(b);
    return { ok: true };
  });
}

// Notice posts with comment counts + archived flag (active-until passed). Newest first.
async function noticePosts(boardId: string) {
  const rows = await db
    .select({ id: boardPosts.id, title: boardPosts.title, body: boardPosts.body, authorName: users.displayName, activeUntil: boardPosts.activeUntil, pinned: boardPosts.pinned, createdAt: boardPosts.createdAt })
    .from(boardPosts)
    .innerJoin(users, eq(users.id, boardPosts.authorId))
    .where(eq(boardPosts.boardId, boardId))
    .orderBy(desc(boardPosts.pinned), desc(boardPosts.createdAt)) // pinned first
    .limit(100);
  const ids = rows.map((r) => r.id);
  const comments = ids.length ? await db.select({ postId: boardPostComments.postId }).from(boardPostComments).where(inArray(boardPostComments.postId, ids)) : [];
  const cc = new Map<string, number>();
  for (const c of comments) cc.set(c.postId, (cc.get(c.postId) ?? 0) + 1);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    activeUntil: r.activeUntil?.toISOString() ?? null,
    pinned: r.pinned,
    archived: !r.pinned && !!r.activeUntil && r.activeUntil.getTime() < now, // pinned notices never archive
    comments: cc.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}
