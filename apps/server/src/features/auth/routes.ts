import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { passwordResets, tenants, users } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { sendEmail } from "../../lib/email.js";
import { recordAudit } from "../../lib/audit.js";
import { env } from "../../env.js";
import { setSession, clearSession } from "../../auth.js";

const authLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

const registerBody = z.object({
  companyName: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotBody = z.object({ email: z.string().email() });
const resetBody = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) });

const RESET_TTL_MS = 60 * 60 * 1000; // 1h

function publicUser(u: { email: string; displayName: string; role: string }) {
  return { email: u.email, displayName: u.displayName, role: u.role };
}

export function authRoutes(app: FastifyInstance) {
  // Is this a fresh install that still needs its first admin? (drives the UI)
  app.get("/api/auth/bootstrap-status", async () => {
    const [{ c }] = await db.select({ c: count() }).from(users);
    return { needsSetup: c === 0 };
  });

  // Public: is open self-registration enabled for this deployment? (single-tenant, Mode C)
  app.get("/api/auth/registration", async () => {
    const [tenant] = await db.select({ mode: tenants.registrationMode }).from(tenants).limit(1);
    return { open: tenant?.mode === "OPEN" };
  });

  // Public self-registration (only when the tenant allows it). New accounts land PENDING approval,
  // with no permission groups (lowest order) until an approver activates them.
  app.post("/api/auth/register-open", authLimit, async (req, reply) => {
    const parsed = z.object({ displayName: z.string().min(1).max(120), email: z.string().email(), password: z.string().min(8).max(200) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant || tenant.registrationMode !== "OPEN") return reply.code(403).send({ error: "registration_closed" });
    const email = parsed.data.email.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return reply.code(400).send({ error: "email_taken" });
    const [user] = await db
      .insert(users)
      .values({ tenantId: tenant.id, email, displayName: parsed.data.displayName, passwordHash: await hashPassword(parsed.data.password), role: "MEMBER", status: "PENDING" })
      .returning();
    await recordAudit({ action: "member.self_registered", tenantId: tenant.id, actorId: user.id, meta: { email } });
    return { ok: true, pending: true };
  });

  // Bootstrap only: works when there are zero users, creates the company + admin.
  // Once an admin exists this is closed — new accounts come via invite.
  app.post("/api/auth/register", authLimit, async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const [{ c }] = await db.select({ c: count() }).from(users);
    if (c > 0) return reply.code(403).send({ error: "registration_closed" });

    const { companyName, displayName, email, password } = parsed.data;
    const [tenant] = await db.insert(tenants).values({ name: companyName }).returning();
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: email.toLowerCase(),
        displayName,
        passwordHash: await hashPassword(password),
        role: "TENANT_ADMIN",
        emailVerified: true, // the person setting up the server is trusted
      })
      .returning();

    await recordAudit({ action: "admin.created", tenantId: tenant.id, actorId: user.id, meta: { email: user.email } });
    setSession(reply, user.id);
    return { user: publicUser(user) };
  });

  app.post("/api/auth/login", authLimit, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const { email, password } = parsed.data;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // One generic error for every failure — never reveal whether the email exists.
    const pwOk = user && user.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !pwOk) return reply.code(401).send({ error: "invalid_credentials" });
    // Correct password but not yet approved → tell them so (they just registered, no info leak).
    if (user.status === "PENDING") return reply.code(403).send({ error: "pending_approval" });
    if (user.status !== "ACTIVE") return reply.code(401).send({ error: "invalid_credentials" }); // disabled

    // TODO: 2FA — if the user has a TOTP secret, require a verified code here before
    // calling setSession. The login form would then show a second step.

    setSession(reply, user.id);
    return { user: publicUser(user) };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  // Always returns ok — never reveal whether the email has an account.
  app.post("/api/auth/forgot", authLimit, async (req, reply) => {
    const parsed = forgotBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    if (user) {
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResets).values({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      const link = `${env.appUrl}/reset-password?token=${token}`;
      await sendEmail({
        to: parsed.data.email.toLowerCase(),
        subject: "Reset your CES password",
        html: `<p>Reset your password (link valid 1 hour):</p><p><a href="${link}">Set a new password</a></p><p>If you didn't request this, ignore this email.</p>`,
      });
    }
    return { ok: true };
  });

  app.post("/api/auth/reset", authLimit, async (req, reply) => {
    const parsed = resetBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.token, parsed.data.token), isNull(passwordResets.usedAt)))
      .limit(1);
    if (!reset || reset.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "invalid_or_expired" });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.password) })
      .where(eq(users.id, reset.userId));
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));

    const [u] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, reset.userId));
    await recordAudit({ action: "password.reset", tenantId: u?.tenantId ?? null, actorId: reset.userId });
    // Note: existing sessions aren't revoked yet (no session store) — acceptable for MVP.
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send({ error: "not_authenticated" });
    return { user: publicUser(req.currentUser) };
  });
}
