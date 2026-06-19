import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sum } from "drizzle-orm";
import { db } from "../../db/client.js";
import { marketplaceItems, redemptions, pointsLedger } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";

const balanceOf = async (userId: string) => Number((await db.select({ s: sum(pointsLedger.delta) }).from(pointsLedger).where(eq(pointsLedger.userId, userId)))[0]?.s ?? 0);

// Allowed COLOR augment tokens (the frontend maps these to hex for the name + avatar ring). A fixed
// palette keeps arbitrary CSS out of the data.
export const COLOR_TOKENS = ["rose", "amber", "emerald", "sky", "violet", "slate"];

export function marketRoutes(app: FastifyInstance) {
  // Storefront: active items + your balance (admins also see inactive items + a manage flag).
  app.get("/api/market", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const isAdmin = me.role === "TENANT_ADMIN";
    const rows = await db.select().from(marketplaceItems).where(eq(marketplaceItems.tenantId, me.tenantId)).orderBy(marketplaceItems.cost);
    const items = rows.filter((r) => isAdmin || r.active).map((r) => ({ id: r.id, name: r.name, description: r.description, icon: r.icon, cost: r.cost, kind: r.kind, augment: r.augment, augmentKind: r.augmentKind, active: r.active }));
    return { canManage: isAdmin, balance: await balanceOf(me.id), items };
  });

  // Redeem an item: must afford it; the spend is an append-only ledger row + a redemption record.
  app.post<{ Params: { id: string } }>("/api/market/items/:id/redeem", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [item] = await db.select().from(marketplaceItems).where(and(eq(marketplaceItems.id, id.data), eq(marketplaceItems.tenantId, me.tenantId)));
    if (!item || !item.active) return reply.code(404).send({ error: "not_found" });
    // A profile flair is owned once — don't let people waste points re-buying it.
    if (item.kind === "PROFILE" && item.augment) {
      const [owned] = await db.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, me.id), eq(redemptions.augment, item.augment)));
      if (owned) return reply.code(400).send({ error: "already_owned" });
    }
    const balance = await balanceOf(me.id);
    if (balance < item.cost) return reply.code(400).send({ error: "insufficient_points", balance });
    const today = new Date().toISOString().slice(0, 10);
    const isProfile = item.kind === "PROFILE";
    await db.insert(pointsLedger).values({ tenantId: me.tenantId, userId: me.id, delta: -item.cost, reason: `redeem:${item.name}`, createdDay: today });
    await db.insert(redemptions).values({ tenantId: me.tenantId, userId: me.id, itemId: item.id, itemName: item.name, cost: item.cost, augment: isProfile ? item.augment : null, augmentKind: isProfile ? item.augmentKind : null });
    return { ok: true, balance: balance - item.cost, augment: isProfile ? item.augment : null, augmentKind: isProfile ? item.augmentKind : null };
  });

  app.get("/api/market/redemptions", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db.select({ itemName: redemptions.itemName, cost: redemptions.cost, createdAt: redemptions.createdAt }).from(redemptions).where(eq(redemptions.userId, me.id)).orderBy(desc(redemptions.createdAt)).limit(50);
    return { redemptions: rows.map((r) => ({ itemName: r.itemName, cost: r.cost, day: r.createdAt.toISOString().slice(0, 10) })) };
  });

  const itemBase = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(300).optional(), icon: z.string().max(8).optional(), cost: z.number().int().min(0).max(1_000_000), kind: z.enum(["PERK", "PROFILE"]).optional(), augment: z.string().trim().max(40).optional(), augmentKind: z.enum(["FLAIR", "TITLE", "COLOR"]).optional(), active: z.boolean().optional() });
  const itemBody = itemBase
    .refine((b) => b.kind !== "PROFILE" || (!!b.augment && !!b.augmentKind), "profile items need an augment + kind")
    .refine((b) => b.augmentKind !== "FLAIR" || (b.augment != null && b.augment.length <= 8), "flair must be a short emoji/badge")
    .refine((b) => b.augmentKind !== "COLOR" || (b.augment != null && COLOR_TOKENS.includes(b.augment)), "unknown colour token");
  app.post("/api/market/items", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = itemBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const isProfile = body.data.kind === "PROFILE";
    const [row] = await db.insert(marketplaceItems).values({ tenantId: me.tenantId, ...body.data, description: body.data.description || null, icon: body.data.icon || null, augment: isProfile ? body.data.augment : null, augmentKind: isProfile ? body.data.augmentKind : null }).returning({ id: marketplaceItems.id });
    return { id: row.id };
  });
  app.patch<{ Params: { id: string } }>("/api/market/items/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = itemBase.partial().safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const res = await db.update(marketplaceItems).set(body.data).where(and(eq(marketplaceItems.id, id.data), eq(marketplaceItems.tenantId, me.tenantId))).returning({ id: marketplaceItems.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/market/items/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    await db.delete(marketplaceItems).where(and(eq(marketplaceItems.id, id.data), eq(marketplaceItems.tenantId, me.tenantId)));
    return { ok: true };
  });
}
