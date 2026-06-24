import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { aiSettings, aiUsage, users } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";
import { encryptKey, decryptKey } from "./crypto.js";
import { complete } from "./providers.js";
import { MODELS, estimateCost } from "./pricing.js";
import { ASSISTANT_SYSTEM } from "./knowledge.js";

const DEFAULTS = { enabled: false, provider: "anthropic", model: "claude-haiku-4-5", weeklyTokenCap: 300000, perUserDailyCap: 30000 };
const mondayStart = () => { const d = new Date(); const off = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - off); d.setUTCHours(0, 0, 0, 0); return d; };
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

export function aiRoutes(app: FastifyInstance) {
  async function load(tenantId: string) {
    const [s] = await db.select().from(aiSettings).where(eq(aiSettings.tenantId, tenantId));
    return s ?? { tenantId, ...DEFAULTS, apiKeyEnc: null };
  }
  const tokensSince = async (tenantId: string, since: Date, userId?: string) => {
    const [r] = await db.select({ n: sql<number>`coalesce(sum(${aiUsage.tokensIn} + ${aiUsage.tokensOut}),0)::int` }).from(aiUsage)
      .where(and(eq(aiUsage.tenantId, tenantId), gte(aiUsage.createdAt, since), userId ? eq(aiUsage.userId, userId) : undefined));
    return Number(r?.n ?? 0);
  };

  // --- Settings (admin). The key is write-only: never returned, only a "keySet" flag. ---
  app.get("/api/ai/settings", { preHandler: requireRole("TENANT_ADMIN") }, async (req) => {
    const s = await load(req.currentUser!.tenantId);
    return { enabled: s.enabled, provider: s.provider, model: s.model, keySet: !!s.apiKeyEnc, weeklyTokenCap: s.weeklyTokenCap, perUserDailyCap: s.perUserDailyCap, models: MODELS };
  });

  app.put("/api/ai/settings", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = z.object({
      enabled: z.boolean().optional(),
      provider: z.enum(["anthropic", "openai", "gemini"]).optional(),
      model: z.string().max(60).optional(),
      apiKey: z.string().max(300).optional(), // "" clears; omitted keeps existing
      weeklyTokenCap: z.number().int().min(0).max(100_000_000).optional(),
      perUserDailyCap: z.number().int().min(0).max(100_000_000).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const cur = await load(me.tenantId);
    const next: any = { tenantId: me.tenantId, enabled: cur.enabled, provider: cur.provider, model: cur.model, apiKeyEnc: cur.apiKeyEnc, weeklyTokenCap: cur.weeklyTokenCap, perUserDailyCap: cur.perUserDailyCap };
    if (body.data.enabled !== undefined) next.enabled = body.data.enabled;
    if (body.data.provider !== undefined) next.provider = body.data.provider;
    if (body.data.model !== undefined) next.model = body.data.model;
    if (body.data.weeklyTokenCap !== undefined) next.weeklyTokenCap = body.data.weeklyTokenCap;
    if (body.data.perUserDailyCap !== undefined) next.perUserDailyCap = body.data.perUserDailyCap;
    if (body.data.apiKey !== undefined) next.apiKeyEnc = body.data.apiKey ? encryptKey(body.data.apiKey) : null;
    // The chosen model must belong to the chosen provider.
    if (!MODELS.some((m) => m.provider === next.provider && m.model === next.model)) next.model = MODELS.find((m) => m.provider === next.provider)!.model;
    await db.insert(aiSettings).values(next).onConflictDoUpdate({ target: aiSettings.tenantId, set: next });
    await recordAudit({ action: "ai.settings_changed", tenantId: me.tenantId, actorId: me.id, meta: { enabled: next.enabled, provider: next.provider, model: next.model, keySet: !!next.apiKeyEnc } });
    return { ok: true };
  });

  // --- Status (any user) — drives whether the assistant UI shows at all. ---
  app.get("/api/ai/status", { preHandler: requireAuth }, async (req) => {
    const s = await load(req.currentUser!.tenantId);
    return { available: s.enabled && !!s.apiKeyEnc };
  });

  // --- Usage / cost dashboard (admin). ---
  app.get("/api/ai/usage", { preHandler: requireRole("TENANT_ADMIN") }, async (req) => {
    const tid = req.currentUser!.tenantId;
    const s = await load(tid);
    const monthAgo = new Date(Date.now() - 30 * 86400_000);
    const rows = await db.select({ userId: aiUsage.userId, feature: aiUsage.feature, model: aiUsage.model, tIn: aiUsage.tokensIn, tOut: aiUsage.tokensOut, at: aiUsage.createdAt }).from(aiUsage).where(and(eq(aiUsage.tenantId, tid), gte(aiUsage.createdAt, monthAgo)));
    const wk = mondayStart();
    let weekTokens = 0, monthCost = 0, weekCost = 0;
    const byFeature = new Map<string, { tokens: number; cost: number }>();
    const byModel = new Map<string, { tokens: number; cost: number }>();
    const byUser = new Map<string, { tokens: number; cost: number }>();
    for (const r of rows) {
      const tok = r.tIn + r.tOut, cost = estimateCost(r.model, r.tIn, r.tOut);
      monthCost += cost;
      if (new Date(r.at) >= wk) { weekTokens += tok; weekCost += cost; }
      const f = byFeature.get(r.feature) ?? { tokens: 0, cost: 0 }; f.tokens += tok; f.cost += cost; byFeature.set(r.feature, f);
      const m = byModel.get(r.model) ?? { tokens: 0, cost: 0 }; m.tokens += tok; m.cost += cost; byModel.set(r.model, m);
      if (r.userId) { const u = byUser.get(r.userId) ?? { tokens: 0, cost: 0 }; u.tokens += tok; u.cost += cost; byUser.set(r.userId, u); }
    }
    const names = new Map((await db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.tenantId, tid))).map((u) => [u.id, u.name]));
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      enabled: s.enabled, configured: !!s.apiKeyEnc, model: s.model, provider: s.provider,
      weeklyTokenCap: s.weeklyTokenCap, weekTokens, weekPct: s.weeklyTokenCap ? Math.min(100, Math.round((weekTokens / s.weeklyTokenCap) * 100)) : 0,
      weekCost: round(weekCost), monthCost: round(monthCost),
      byFeature: [...byFeature].map(([k, v]) => ({ feature: k, tokens: v.tokens, cost: round(v.cost) })).sort((a, b) => b.tokens - a.tokens),
      byModel: [...byModel].map(([k, v]) => ({ model: k, tokens: v.tokens, cost: round(v.cost) })).sort((a, b) => b.tokens - a.tokens),
      topUsers: [...byUser].map(([k, v]) => ({ name: names.get(k) ?? "—", tokens: v.tokens, cost: round(v.cost) })).sort((a, b) => b.tokens - a.tokens).slice(0, 10),
    };
  });

  // --- The in-app assistant. Grounded in the manual; metered + capped. ---
  app.post("/api/ai/assistant", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ question: z.string().trim().min(2).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const s = await load(me.tenantId);
    if (!s.enabled || !s.apiKeyEnc) return reply.code(400).send({ error: "ai_not_configured" });
    // Caps: weekly (tenant) + daily (per user). 0 = unlimited.
    if (s.weeklyTokenCap && (await tokensSince(me.tenantId, mondayStart())) >= s.weeklyTokenCap) return reply.code(429).send({ error: "weekly_cap_reached" });
    if (s.perUserDailyCap && (await tokensSince(me.tenantId, dayStart(), me.id)) >= s.perUserDailyCap) return reply.code(429).send({ error: "daily_cap_reached" });
    const apiKey = decryptKey(s.apiKeyEnc);
    if (!apiKey) return reply.code(500).send({ error: "key_unreadable" });
    let res;
    try {
      res = await complete({ provider: s.provider, model: s.model, apiKey, system: ASSISTANT_SYSTEM, user: body.data.question, maxTokens: 600 });
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: "provider_error" });
    }
    await db.insert(aiUsage).values({ tenantId: me.tenantId, userId: me.id, feature: "ASSISTANT", provider: s.provider, model: s.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut });
    // Audit purpose + scope + token counts only — NEVER the question or answer (CLAUDE.md).
    await recordAudit({ action: "ai.call", tenantId: me.tenantId, actorId: me.id, meta: { feature: "ASSISTANT", model: s.model, tokensIn: res.tokensIn, tokensOut: res.tokensOut } });
    return { answer: res.text, tokensIn: res.tokensIn, tokensOut: res.tokensOut };
  });
}
