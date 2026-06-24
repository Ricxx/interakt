import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { legalDocs, legalAcceptances } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";

const KINDS = ["TOS", "PRIVACY"] as const;

// Editable Terms of Service + Privacy Policy. Editing bumps the version; anyone whose accepted version
// is older is re-prompted on next login (the desktop blocks until they accept).
export function legalRoutes(app: FastifyInstance) {
  app.get("/api/legal", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const docs = await db.select().from(legalDocs).where(eq(legalDocs.tenantId, me.tenantId));
    const acc = new Map((await db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, me.id))).map((a) => [a.kind, a.version]));
    const out: Record<string, { body: string; version: number; accepted: boolean } | null> = { TOS: null, PRIVACY: null };
    const pending: string[] = [];
    for (const d of docs) {
      if (!d.body.trim()) continue;
      const accepted = (acc.get(d.kind) ?? 0) >= d.version;
      out[d.kind] = { body: d.body, version: d.version, accepted };
      if (!accepted) pending.push(d.kind);
    }
    return { docs: out, pending };
  });

  app.post("/api/legal/accept", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ kind: z.enum(KINDS) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [d] = await db.select({ version: legalDocs.version }).from(legalDocs).where(and(eq(legalDocs.tenantId, me.tenantId), eq(legalDocs.kind, body.data.kind)));
    if (!d) return reply.code(404).send({ error: "not_found" });
    await db.insert(legalAcceptances).values({ userId: me.id, kind: body.data.kind, version: d.version }).onConflictDoUpdate({ target: [legalAcceptances.userId, legalAcceptances.kind], set: { version: d.version, acceptedAt: new Date() } });
    return { ok: true };
  });

  // Admin: edit a document. First save = version 1; each later save bumps the version (re-prompts all).
  app.put<{ Params: { kind: string } }>("/api/legal/:kind", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const kind = z.enum(KINDS).safeParse((req.params as { kind: string }).kind);
    const body = z.object({ body: z.string().trim().max(50000) }).safeParse(req.body);
    if (!kind.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [cur] = await db.select({ version: legalDocs.version }).from(legalDocs).where(and(eq(legalDocs.tenantId, me.tenantId), eq(legalDocs.kind, kind.data)));
    const version = cur ? cur.version + 1 : 1;
    await db.insert(legalDocs).values({ tenantId: me.tenantId, kind: kind.data, body: body.data.body, version, updatedBy: me.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [legalDocs.tenantId, legalDocs.kind], set: { body: body.data.body, version, updatedBy: me.id, updatedAt: new Date() } });
    await recordAudit({ action: "legal.updated", tenantId: me.tenantId, actorId: me.id, meta: { kind: kind.data, version } });
    return { ok: true, version };
  });
}
