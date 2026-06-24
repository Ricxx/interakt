import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "../../db/client.js";
import { events, eventPhotos, eventPhotoComments, eventPhotoLikes, eventContributions, lists, users } from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { can, hasScope, isGoverned } from "../../lib/capabilities.js";
import { canSeeScoped, scopeLabel } from "../../lib/scopeAccess.js";

type Me = { id: string; tenantId: string; role: string };

// iCal helpers — format a UTC timestamp and escape text per RFC 5545.
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// iCal import (inverse of the export): pull VEVENTs out of a feed. Minimal — SUMMARY, DESCRIPTION,
// DTSTART/DTEND only. Times without a Z (or with a TZID) are treated as UTC; we don't ship a tz database.
const icsUnesc = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
function parseIcsDate(v: string): Date | null {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return isNaN(dt.getTime()) ? null : dt;
}
function parseIcs(text: string) {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); // RFC 5545 line unfolding
  const out: { title: string; description: string | null; start: Date; end: Date | null }[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const get = (name: string) => { const m = body.match(new RegExp(`^${name}[^:\\n]*:(.*)$`, "m")); return m ? m[1].trim() : null; };
    const startRaw = get("DTSTART"), title = get("SUMMARY");
    const start = startRaw ? parseIcsDate(startRaw) : null;
    if (!start || !title) continue; // need a time and a name to be a usable event
    const desc = get("DESCRIPTION"), endRaw = get("DTEND");
    out.push({ title: icsUnesc(title).slice(0, 160), description: desc ? icsUnesc(desc).slice(0, 4000) : null, start, end: endRaw ? parseIcsDate(endRaw) : null });
  }
  return out;
}

export function eventRoutes(app: FastifyInstance) {
  // Org-wide events / theme days need event.manage; dept/team-scoped ones are open to anyone
  // (no-lockout: ungoverned tenants stay open, admins bypass).
  async function mayUseScope(me: Me, scopeKind: string, scopeId: string | null): Promise<boolean> {
    if (scopeKind === "NODE" || scopeKind === "GROUP") return true;
    if (!(await isGoverned(me.id))) return true;
    return hasScope(me, "event.manage", "ORG"); // ALL = org-wide
  }
  async function load(me: Me, id: string) {
    const [e] = await db.select().from(events).where(and(eq(events.id, id), eq(events.tenantId, me.tenantId)));
    if (!e) return null;
    const see = e.createdBy === me.id || (await canSeeScoped({ tenantId: me.tenantId, scopeKind: e.scopeKind, scopeId: e.scopeId }, me.id, me.tenantId));
    return see ? e : "forbidden";
  }

  app.post("/api/events", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(["PLAN", "FUND", "THEME_DAY"]),
        title: z.string().trim().min(1).max(160),
        instructions: z.string().max(4000).optional(),
        scopeKind: z.enum(["ALL", "NODE", "GROUP"]),
        scopeId: z.string().uuid().nullable().optional(),
        startAt: z.string().datetime().nullable().optional(),
        endAt: z.string().datetime().nullable().optional(),
        goalAmount: z.number().int().min(0).nullable().optional(),
        galleryAnon: z.boolean().optional(),
        listId: z.string().uuid().optional(), // "Add to calendar" from a list attaches it in one call
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const d = body.data;
    if ((d.scopeKind === "NODE" || d.scopeKind === "GROUP") && !d.scopeId) return reply.code(400).send({ error: "scope_required" });
    if (!(await mayUseScope(me, d.scopeKind, d.scopeId ?? null))) return reply.code(403).send({ error: "forbidden" });
    if (d.listId) { const [l] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, d.listId), eq(lists.tenantId, me.tenantId))); if (!l) return reply.code(400).send({ error: "bad_list" }); }
    const [row] = await db
      .insert(events)
      .values({ tenantId: me.tenantId, kind: d.kind, title: d.title.trim(), instructions: d.instructions?.trim() || null, scopeKind: d.scopeKind, scopeId: d.scopeId ?? null, startAt: d.startAt ? new Date(d.startAt) : null, endAt: d.endAt ? new Date(d.endAt) : null, goalAmount: d.goalAmount ?? null, galleryAnon: d.galleryAnon ?? true, listId: d.listId ?? null, createdBy: me.id })
      .returning({ id: events.id });
    if (d.scopeKind === "ALL") await recordAudit({ action: "event.created", tenantId: me.tenantId, actorId: me.id, meta: { id: row.id, kind: d.kind, scope: "ALL" } });
    return { id: row.id };
  });

  // List events the viewer can see (most recent / upcoming first).
  app.get("/api/events", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(events).where(eq(events.tenantId, me.tenantId)).orderBy(desc(events.createdAt)).limit(100);
    const out = [];
    for (const e of rows) {
      if (e.createdBy !== me.id && !(await canSeeScoped({ tenantId: me.tenantId, scopeKind: e.scopeKind, scopeId: e.scopeId }, me.id, me.tenantId))) continue;
      out.push({ id: e.id, kind: e.kind, title: e.title, scopeKind: e.scopeKind, scope: await scopeLabel(me.tenantId, e.scopeKind, e.scopeId), startAt: e.startAt?.toISOString() ?? null, endAt: e.endAt?.toISOString() ?? null, goalAmount: e.goalAmount, mine: e.createdBy === me.id });
    }
    return { events: out };
  });

  app.get("/api/events/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const e = await load(me, id.data);
    if (!e) return reply.code(404).send({ error: "not_found" });
    if (e === "forbidden") return reply.code(403).send({ error: "forbidden" });
    const isAdmin = me.role === "TENANT_ADMIN";
    const [list] = e.listId ? await db.select({ id: lists.id, title: lists.title }).from(lists).where(eq(lists.id, e.listId)) : [];
    return {
      id: e.id, kind: e.kind, title: e.title, instructions: e.instructions,
      scope: await scopeLabel(me.tenantId, e.scopeKind, e.scopeId),
      startAt: e.startAt?.toISOString() ?? null, endAt: e.endAt?.toISOString() ?? null,
      goalAmount: e.goalAmount, galleryAnon: e.galleryAnon,
      list: list ?? null,
      canManage: isAdmin || e.createdBy === me.id,
    };
  });

  // Export the viewer's visible scheduled events as an iCal feed (drop into any personal calendar).
  app.get("/api/events/calendar.ics", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser! as Me;
    const rows = await db.select().from(events).where(eq(events.tenantId, me.tenantId));
    const stamp = icsDate(new Date());
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CES//Events//EN", "CALSCALE:GREGORIAN"];
    for (const e of rows) {
      if (!e.startAt) continue;
      if (e.createdBy !== me.id && !(await canSeeScoped({ tenantId: me.tenantId, scopeKind: e.scopeKind, scopeId: e.scopeId }, me.id, me.tenantId))) continue;
      lines.push("BEGIN:VEVENT", `UID:${e.id}@ces`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(e.startAt)}`);
      if (e.endAt) lines.push(`DTEND:${icsDate(e.endAt)}`);
      lines.push(`SUMMARY:${icsEsc(e.title)}`);
      if (e.instructions) lines.push(`DESCRIPTION:${icsEsc(e.instructions)}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    reply.header("content-type", "text/calendar; charset=utf-8").header("content-disposition", "attachment; filename=ces-events.ics");
    return lines.join("\r\n");
  });

  // Import an iCal feed → PLAN events filed under the importer's department (they're the creator, so they
  // always see them; their node sees them too). One click, no scope picker. Caps at 200, reports the rest.
  app.post("/api/events/import-ics", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ ics: z.string().min(1).max(1_000_000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [u] = await db.select({ nodeId: users.nodeId }).from(users).where(eq(users.id, me.id));
    if (!u?.nodeId) return reply.code(400).send({ error: "no_node" }); // need a department to file them under
    const parsed = parseIcs(body.data.ics);
    if (parsed.length === 0) return reply.code(400).send({ error: "no_events" });
    const slice = parsed.slice(0, 200);
    await db.insert(events).values(slice.map((e) => ({ tenantId: me.tenantId, kind: "PLAN" as const, title: e.title, instructions: e.description, scopeKind: "NODE" as const, scopeId: u.nodeId!, startAt: e.start, endAt: e.end, galleryAnon: true, createdBy: me.id })));
    return { imported: slice.length, skipped: parsed.length - slice.length };
  });

  // Update an event (creator/admin): gallery anonymity and/or attach a list (to-do). listId null detaches.
  app.patch("/api/events/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const body = z.object({ galleryAnon: z.boolean().optional(), listId: z.string().uuid().nullable().optional() }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const e = await load(me, id.data);
    if (!e || e === "forbidden") return reply.code(e === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (e.createdBy !== me.id && me.role !== "TENANT_ADMIN") return reply.code(403).send({ error: "forbidden" });
    const patch: Record<string, unknown> = {};
    if (body.data.galleryAnon !== undefined) patch.galleryAnon = body.data.galleryAnon;
    if (body.data.listId !== undefined) {
      if (body.data.listId) { const [l] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, body.data.listId), eq(lists.tenantId, me.tenantId))); if (!l) return reply.code(400).send({ error: "bad_list" }); }
      patch.listId = body.data.listId;
    }
    if (Object.keys(patch).length) await db.update(events).set(patch).where(eq(events.id, id.data));
    return { ok: true };
  });

  // --- Contributions (FUND events) — append-only ledger; record-only, no edits/deletes ---
  app.get("/api/events/:id/contributions", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const e = await load(me, id.data);
    if (!e || e === "forbidden") return reply.code(e === "forbidden" ? 403 : 404).send({ error: "not_found" });
    const author = alias(users, "author");
    const rows = await db
      .select({ id: eventContributions.id, amount: eventContributions.amount, note: eventContributions.note, createdAt: eventContributions.createdAt, name: author.displayName, userId: eventContributions.userId })
      .from(eventContributions)
      .innerJoin(author, eq(author.id, eventContributions.userId))
      .where(eq(eventContributions.eventId, id.data))
      .orderBy(desc(eventContributions.createdAt));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const mine = rows.filter((r) => r.userId === me.id).reduce((s, r) => s + r.amount, 0);
    return { goal: e.goalAmount, total, mine, count: rows.length, contributions: rows.map((r) => ({ name: r.name, amount: r.amount, note: r.note, day: r.createdAt.toISOString().slice(0, 10) })) };
  });

  app.post("/api/events/:id/contributions", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const body = z.object({ amount: z.number().int().min(1).max(100_000_000), note: z.string().max(200).optional() }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const e = await load(me, id.data);
    if (!e || e === "forbidden") return reply.code(e === "forbidden" ? 403 : 404).send({ error: "not_found" });
    if (e.kind !== "FUND") return reply.code(400).send({ error: "not_a_fund" });
    await db.insert(eventContributions).values({ eventId: id.data, userId: me.id, amount: body.data.amount, note: body.data.note?.trim() || null });
    return { ok: true };
  });

  // --- Gallery ---
  app.get("/api/events/:id/photos", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const e = await load(me, id.data);
    if (!e || e === "forbidden") return reply.code(e === "forbidden" ? 403 : 404).send({ error: "not_found" });
    const adder = alias(users, "adder");
    const rows = await db
      .select({ id: eventPhotos.id, number: eventPhotos.number, url: eventPhotos.url, caption: eventPhotos.caption, addedBy: eventPhotos.addedBy, byName: adder.displayName, createdAt: eventPhotos.createdAt })
      .from(eventPhotos)
      .innerJoin(adder, eq(adder.id, eventPhotos.addedBy))
      .where(and(eq(eventPhotos.eventId, id.data), eq(eventPhotos.hidden, false)))
      .orderBy(asc(eventPhotos.number));
    const ids = rows.map((r) => r.id);
    const likeCount = new Map<string, number>(), likedByMe = new Set<string>(), commentCount = new Map<string, number>(), likerIds = new Map<string, string[]>();
    if (ids.length) {
      for (const l of await db.select({ pid: eventPhotoLikes.photoId, uid: eventPhotoLikes.userId }).from(eventPhotoLikes).where(inArray(eventPhotoLikes.photoId, ids))) {
        likeCount.set(l.pid, (likeCount.get(l.pid) ?? 0) + 1);
        if (l.uid === me.id) likedByMe.add(l.pid);
        likerIds.set(l.pid, [...(likerIds.get(l.pid) ?? []), l.uid]);
      }
      for (const c of await db.select({ pid: eventPhotoComments.photoId }).from(eventPhotoComments).where(inArray(eventPhotoComments.photoId, ids))) commentCount.set(c.pid, (commentCount.get(c.pid) ?? 0) + 1);
    }
    // Names are only resolved (and sent) when the gallery has anonymity turned OFF.
    const name = new Map<string, string>();
    if (!e.galleryAnon) {
      const all = [...new Set([...likerIds.values()].flat())];
      if (all.length) for (const u of await db.select({ id: users.id, n: users.displayName }).from(users).where(inArray(users.id, all))) name.set(u.id, u.n);
    }
    const isAdmin = me.role === "TENANT_ADMIN";
    return {
      anon: e.galleryAnon,
      photos: rows.map((r) => ({ id: r.id, number: r.number, url: r.url, caption: r.caption, byName: r.byName, mine: r.addedBy === me.id, canDelete: isAdmin || r.addedBy === me.id || e.createdBy === me.id, likes: likeCount.get(r.id) ?? 0, likedByMe: likedByMe.has(r.id), comments: commentCount.get(r.id) ?? 0, likers: e.galleryAnon ? [] : (likerIds.get(r.id) ?? []).map((u) => name.get(u) ?? "Someone") })),
    };
  });

  app.post("/api/events/:id/photos", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const body = z.object({ url: z.string().trim().max(2000).refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/api/uploads/"), "bad_url"), caption: z.string().max(300).optional() }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const e = await load(me, id.data);
    if (!e || e === "forbidden") return reply.code(e === "forbidden" ? 403 : 404).send({ error: "not_found" });
    // Next unique number for this event.
    const [{ n }] = await db.select({ n: max(eventPhotos.number) }).from(eventPhotos).where(eq(eventPhotos.eventId, id.data));
    const [row] = await db.insert(eventPhotos).values({ eventId: id.data, number: (n ?? 0) + 1, url: body.data.url, caption: body.data.caption?.trim() || null, addedBy: me.id }).returning({ id: eventPhotos.id, number: eventPhotos.number });
    return { id: row.id, number: row.number };
  });

  app.delete("/api/events/photos/:photoId", { preHandler: requireAuth }, async (req, reply) => {
    const pid = z.string().uuid().safeParse((req.params as { photoId: string }).photoId);
    if (!pid.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [p] = await db.select({ addedBy: eventPhotos.addedBy, eventCreator: events.createdBy }).from(eventPhotos).innerJoin(events, eq(events.id, eventPhotos.eventId)).where(and(eq(eventPhotos.id, pid.data), eq(events.tenantId, me.tenantId)));
    if (!p) return reply.code(404).send({ error: "not_found" });
    if (p.addedBy !== me.id && p.eventCreator !== me.id && me.role !== "TENANT_ADMIN") return reply.code(403).send({ error: "forbidden" });
    await db.delete(eventPhotoLikes).where(eq(eventPhotoLikes.photoId, pid.data));
    await db.delete(eventPhotoComments).where(eq(eventPhotoComments.photoId, pid.data));
    await db.delete(eventPhotos).where(eq(eventPhotos.id, pid.data));
    return { ok: true };
  });

  // Like a photo (toggle). Count always shown; names hidden unless the event has gallery_anon off.
  app.post("/api/events/photos/:photoId/like", { preHandler: requireAuth }, async (req, reply) => {
    const pid = z.string().uuid().safeParse((req.params as { photoId: string }).photoId);
    if (!pid.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [p] = await db.select({ id: eventPhotos.id }).from(eventPhotos).innerJoin(events, eq(events.id, eventPhotos.eventId)).where(and(eq(eventPhotos.id, pid.data), eq(events.tenantId, me.tenantId)));
    if (!p) return reply.code(404).send({ error: "not_found" });
    const mine = and(eq(eventPhotoLikes.photoId, pid.data), eq(eventPhotoLikes.userId, me.id));
    const [existing] = await db.select().from(eventPhotoLikes).where(mine);
    if (existing) await db.delete(eventPhotoLikes).where(mine);
    else await db.insert(eventPhotoLikes).values({ photoId: pid.data, userId: me.id });
    return { liked: !existing };
  });

  // Comments + one level of replies.
  app.get("/api/events/photos/:photoId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const pid = z.string().uuid().safeParse((req.params as { photoId: string }).photoId);
    if (!pid.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [p] = await db.select({ id: eventPhotos.id }).from(eventPhotos).innerJoin(events, eq(events.id, eventPhotos.eventId)).where(and(eq(eventPhotos.id, pid.data), eq(events.tenantId, me.tenantId)));
    if (!p) return reply.code(404).send({ error: "not_found" });
    const author = alias(users, "author");
    const isAdmin = me.role === "TENANT_ADMIN";
    const rows = await db
      .select({ id: eventPhotoComments.id, body: eventPhotoComments.body, parentId: eventPhotoComments.parentId, createdAt: eventPhotoComments.createdAt, authorId: eventPhotoComments.userId, authorName: author.displayName })
      .from(eventPhotoComments)
      .innerJoin(author, eq(author.id, eventPhotoComments.userId))
      .where(eq(eventPhotoComments.photoId, pid.data))
      .orderBy(asc(eventPhotoComments.createdAt));
    return { comments: rows.map((c) => ({ ...c, canDelete: isAdmin || c.authorId === me.id })) };
  });

  app.post("/api/events/photos/:photoId/comments", { preHandler: requireAuth }, async (req, reply) => {
    const pid = z.string().uuid().safeParse((req.params as { photoId: string }).photoId);
    const body = z.object({ body: z.string().trim().min(1).max(500), parentId: z.string().uuid().optional() }).safeParse(req.body ?? {});
    if (!pid.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [p] = await db.select({ id: eventPhotos.id }).from(eventPhotos).innerJoin(events, eq(events.id, eventPhotos.eventId)).where(and(eq(eventPhotos.id, pid.data), eq(events.tenantId, me.tenantId)));
    if (!p) return reply.code(404).send({ error: "not_found" });
    const [row] = await db.insert(eventPhotoComments).values({ photoId: pid.data, userId: me.id, body: body.data.body.trim(), parentId: body.data.parentId ?? null }).returning({ id: eventPhotoComments.id });
    return { id: row.id };
  });

  app.delete("/api/events/comments/:commentId", { preHandler: requireAuth }, async (req, reply) => {
    const cid = z.string().uuid().safeParse((req.params as { commentId: string }).commentId);
    if (!cid.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser! as Me;
    const [c] = await db.select({ userId: eventPhotoComments.userId }).from(eventPhotoComments).innerJoin(eventPhotos, eq(eventPhotos.id, eventPhotoComments.photoId)).innerJoin(events, eq(events.id, eventPhotos.eventId)).where(and(eq(eventPhotoComments.id, cid.data), eq(events.tenantId, me.tenantId)));
    if (!c) return reply.code(404).send({ error: "not_found" });
    if (c.userId !== me.id && me.role !== "TENANT_ADMIN") return reply.code(403).send({ error: "forbidden" });
    await db.delete(eventPhotoComments).where(eq(eventPhotoComments.id, cid.data));
    return { ok: true };
  });
}
