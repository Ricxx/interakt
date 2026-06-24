import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { tenants } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth.js";
import { recordAudit } from "../../lib/audit.js";

// Is this a real IANA timezone? Intl throws on an unknown zone — cheap, robust validation.
function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

// Feature areas an org may hide from the nav (declutter only — these are all internal authed
// features, so hiding ≠ access control). Core areas (Dashboard, Sessions, Notifications, admin) aren't
// toggleable. Keep in sync with the labels/nav mapping on the desktop.
export const TOGGLEABLE_MODULES = ["quizzes", "tournaments", "scoreboards", "recognition", "highlights", "achievements", "shop", "boards", "repository", "lists", "surveys", "tasks", "events", "calendar", "wellness", "directory", "suggestions", "actions", "announcements"] as const;

// Curated accent palette — keys only (the desktop maps each to a hue + swatch). A fixed set keeps
// contrast predictable vs. letting an org paste any hex.
export const BRAND_COLORS = ["blue", "indigo", "violet", "emerald", "teal", "rose", "amber", "crimson", "slate"] as const;

// White-label vocabulary the org can override. Keys are fixed; values are their preferred word.
export const TERM_KEYS = ["points", "pointsPlural", "recognition", "session", "sessionPlural"] as const;

export function tenantRoutes(app: FastifyInstance) {
  // Anyone can read workspace settings — the timezone is needed to render scheduled times correctly.
  app.get("/api/tenant/settings", { preHandler: requireAuth }, async (req) => {
    const [t] = await db.select({ name: tenants.name, timezone: tenants.timezone, registrationMode: tenants.registrationMode, usageLogEnabled: tenants.usageLogEnabled, profilePicsEnabled: tenants.profilePicsEnabled, disabledModules: tenants.disabledModules, brandColor: tenants.brandColor, brandEmoji: tenants.brandEmoji, brandLogoUrl: tenants.brandLogoUrl, welcomeMessage: tenants.welcomeMessage, terms: tenants.terms, footerCredit: tenants.footerCredit }).from(tenants).where(eq(tenants.id, req.currentUser!.tenantId));
    return t ?? { name: "", timezone: "UTC", registrationMode: "INVITE_ONLY", usageLogEnabled: false, profilePicsEnabled: true, disabledModules: [], brandColor: "blue", brandEmoji: null, brandLogoUrl: null, welcomeMessage: null, terms: {}, footerCredit: true };
  });

  // Admin: workspace settings — timezone (drives scheduled-time displays) and the usage-log toggle.
  app.patch("/api/tenant/settings", { preHandler: requireRole("TENANT_ADMIN") }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80).optional(), timezone: z.string().min(1).max(64).optional(), usageLogEnabled: z.boolean().optional(), profilePicsEnabled: z.boolean().optional(), disabledModules: z.array(z.enum(TOGGLEABLE_MODULES)).optional(), brandColor: z.enum(BRAND_COLORS).optional(), brandEmoji: z.string().trim().max(8).nullable().optional(), brandLogoUrl: z.string().trim().max(500).nullable().optional(), welcomeMessage: z.string().trim().max(280).nullable().optional(), terms: z.record(z.enum(TERM_KEYS), z.string().trim().max(30)).optional(), footerCredit: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (body.data.timezone !== undefined && !validTz(body.data.timezone)) return reply.code(400).send({ error: "invalid_timezone" });
    const me = req.currentUser!;
    const patch: Record<string, unknown> = {};
    if (body.data.name !== undefined) patch.name = body.data.name;
    if (body.data.timezone !== undefined) patch.timezone = body.data.timezone;
    if (body.data.usageLogEnabled !== undefined) patch.usageLogEnabled = body.data.usageLogEnabled;
    if (body.data.profilePicsEnabled !== undefined) patch.profilePicsEnabled = body.data.profilePicsEnabled;
    if (body.data.disabledModules !== undefined) patch.disabledModules = [...new Set(body.data.disabledModules)];
    if (body.data.brandColor !== undefined) patch.brandColor = body.data.brandColor;
    if (body.data.brandEmoji !== undefined) patch.brandEmoji = body.data.brandEmoji || null;
    if (body.data.brandLogoUrl !== undefined) patch.brandLogoUrl = body.data.brandLogoUrl || null;
    if (body.data.welcomeMessage !== undefined) patch.welcomeMessage = body.data.welcomeMessage || null;
    if (body.data.terms !== undefined) { const clean: Record<string, string> = {}; for (const [k, v] of Object.entries(body.data.terms)) if (v && v.trim()) clean[k] = v.trim(); patch.terms = clean; }
    if (body.data.footerCredit !== undefined) patch.footerCredit = body.data.footerCredit;
    if (!Object.keys(patch).length) return { ok: true };
    await db.update(tenants).set(patch).where(eq(tenants.id, me.tenantId));
    await recordAudit({ action: "tenant.settings_changed", tenantId: me.tenantId, actorId: me.id, meta: patch });
    return { ok: true };
  });
}
