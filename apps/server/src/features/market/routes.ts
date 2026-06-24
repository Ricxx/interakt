import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gt, inArray, isNull, sql, sum } from "drizzle-orm";
import { db } from "../../db/client.js";
import { marketplaceItems, marketplaceCodes, redemptions, pointsLedger, users } from "../../db/schema.js";
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
    // Code-based items: availability is the number of unredeemed codes left in the pool.
    const ids = rows.map((r) => r.id);
    const codeRows = ids.length ? await db.select({ itemId: marketplaceCodes.itemId, used: marketplaceCodes.redeemedBy }).from(marketplaceCodes).where(inArray(marketplaceCodes.itemId, ids)) : [];
    const codedItems = new Set(codeRows.map((c) => c.itemId));
    const remainingCodes = (itemId: string) => codeRows.filter((c) => c.itemId === itemId && c.used == null).length;
    const items = rows.filter((r) => isAdmin || r.active).map((r) => {
      const coded = codedItems.has(r.id);
      return { id: r.id, name: r.name, description: r.description, icon: r.icon, image: r.image, cost: r.cost, stock: coded ? remainingCodes(r.id) : r.stock, coded, redemptionInfo: r.redemptionInfo, kind: r.kind, augment: r.augment, augmentKind: r.augmentKind, active: r.active };
    });
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

    // Is this a code-based item (has a code pool)? If so, claim one unredeemed code.
    const [{ c: codeCount }] = await db.select({ c: count() }).from(marketplaceCodes).where(eq(marketplaceCodes.itemId, item.id));
    let claimedCode: string | null = null;
    if (codeCount > 0) {
      const [free] = await db.select({ id: marketplaceCodes.id, code: marketplaceCodes.code }).from(marketplaceCodes).where(and(eq(marketplaceCodes.itemId, item.id), isNull(marketplaceCodes.redeemedBy))).limit(1);
      if (!free) return reply.code(409).send({ error: "out_of_stock" });
      const claimed = await db.update(marketplaceCodes).set({ redeemedBy: me.id, redeemedAt: new Date() }).where(and(eq(marketplaceCodes.id, free.id), isNull(marketplaceCodes.redeemedBy))).returning({ id: marketplaceCodes.id });
      if (!claimed.length) return reply.code(409).send({ error: "out_of_stock" }); // lost the race for that code
      claimedCode = free.code;
    } else if (item.stock != null) {
      // Plain limited stock (null = unlimited): atomically claim one so we can't oversell under a race.
      const claimed = await db.update(marketplaceItems).set({ stock: sql`${marketplaceItems.stock} - 1` }).where(and(eq(marketplaceItems.id, item.id), gt(marketplaceItems.stock, 0))).returning({ id: marketplaceItems.id });
      if (!claimed.length) return reply.code(409).send({ error: "out_of_stock" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const isProfile = item.kind === "PROFILE";
    await db.insert(pointsLedger).values({ tenantId: me.tenantId, userId: me.id, delta: -item.cost, reason: `redeem:${item.name}`, createdDay: today });
    await db.insert(redemptions).values({ tenantId: me.tenantId, userId: me.id, itemId: item.id, itemName: item.name, cost: item.cost, code: claimedCode, augment: isProfile ? item.augment : null, augmentKind: isProfile ? item.augmentKind : null });
    return { ok: true, balance: balance - item.cost, code: claimedCode, redemptionInfo: item.redemptionInfo, augment: isProfile ? item.augment : null, augmentKind: isProfile ? item.augmentKind : null };
  });

  app.get("/api/market/redemptions", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db.select({ itemName: redemptions.itemName, cost: redemptions.cost, code: redemptions.code, createdAt: redemptions.createdAt }).from(redemptions).where(eq(redemptions.userId, me.id)).orderBy(desc(redemptions.createdAt)).limit(50);
    return { redemptions: rows.map((r) => ({ itemName: r.itemName, cost: r.cost, code: r.code, day: r.createdAt.toISOString().slice(0, 10) })) };
  });

  // Admin: who bought what across the whole shop (purchase history / sales).
  app.get("/api/market/sales", { preHandler: requireRole("TENANT_ADMIN") }, async (req) => {
    const me = req.currentUser!;
    const rows = await db
      .select({ buyer: users.displayName, itemName: redemptions.itemName, cost: redemptions.cost, createdAt: redemptions.createdAt })
      .from(redemptions)
      .innerJoin(users, eq(users.id, redemptions.userId))
      .where(eq(redemptions.tenantId, me.tenantId))
      .orderBy(desc(redemptions.createdAt))
      .limit(200);
    return { sales: rows.map((r) => ({ buyer: r.buyer, itemName: r.itemName, cost: r.cost, day: r.createdAt.toISOString().slice(0, 10) })) };
  });

  const imageRef = z.string().trim().max(1000).refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/api/uploads/"), "bad_url");
  const itemBase = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(300).optional(), icon: z.string().max(8).optional(), image: imageRef.nullable().optional(), cost: z.number().int().min(0).max(1_000_000), stock: z.number().int().min(0).max(1_000_000).nullable().optional(), redemptionInfo: z.string().max(1000).optional(), codes: z.array(z.string().trim().min(1).max(200)).max(1000).optional(), kind: z.enum(["PERK", "PROFILE"]).optional(), augment: z.string().trim().max(40).optional(), augmentKind: z.enum(["FLAIR", "TITLE", "COLOR"]).optional(), active: z.boolean().optional() });
  const itemBody = itemBase
    .refine((b) => b.kind !== "PROFILE" || (!!b.augment && !!b.augmentKind), "profile items need an augment + kind")
    .refine((b) => b.augmentKind !== "FLAIR" || (b.augment != null && b.augment.length <= 8), "flair must be a short emoji/badge")
    .refine((b) => b.augmentKind !== "COLOR" || (b.augment != null && COLOR_TOKENS.includes(b.augment)), "unknown colour token");
  app.post("/api/market/items", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = itemBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const isProfile = body.data.kind === "PROFILE";
    const { codes, ...fields } = body.data;
    const [row] = await db.insert(marketplaceItems).values({ tenantId: me.tenantId, ...fields, description: fields.description || null, icon: fields.icon || null, image: fields.image || null, redemptionInfo: fields.redemptionInfo?.trim() || null, stock: codes?.length ? null : fields.stock ?? null, augment: isProfile ? fields.augment : null, augmentKind: isProfile ? fields.augmentKind : null }).returning({ id: marketplaceItems.id });
    if (codes?.length) await db.insert(marketplaceCodes).values(codes.map((code) => ({ tenantId: me.tenantId, itemId: row.id, code: code.trim() })));
    return { id: row.id };
  });
  app.patch<{ Params: { id: string } }>("/api/market/items/:id", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = itemBase.partial().safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const { codes, ...fields } = body.data; // codes are a separate pool, not a column — append, don't overwrite
    const res = await db.update(marketplaceItems).set(fields).where(and(eq(marketplaceItems.id, id.data), eq(marketplaceItems.tenantId, me.tenantId))).returning({ id: marketplaceItems.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    if (codes?.length) await db.insert(marketplaceCodes).values(codes.map((code) => ({ tenantId: me.tenantId, itemId: id.data, code: code.trim() })));
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
