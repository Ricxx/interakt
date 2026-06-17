import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { invites, orgNodes, tenants, users } from "../../db/schema.js";
import { hashPassword } from "../../lib/password.js";
import { sendEmail } from "../../lib/email.js";
import { recordAudit } from "../../lib/audit.js";
import { can } from "../../lib/capabilities.js";
import { env } from "../../env.js";
import { requireAuth, requireRole, setSession } from "../../auth.js";

const authLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
const adminOnly = { preHandler: requireRole("TENANT_ADMIN") };

const inviteBody = z.object({
  email: z.string().email(),
  role: z.enum(["TENANT_ADMIN", "NODE_ADMIN", "FACILITATOR", "MEMBER"]).default("MEMBER"),
});

const acceptBody = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

const assignBody = z.object({ nodeId: z.string().uuid().nullable() });

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function memberRoutes(app: FastifyInstance) {
  // Admin: who's in this company + which invites are still pending.
  app.get("/api/members", adminOnly, async (req) => {
    const tenantId = req.currentUser!.tenantId;
    const memberRows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        nodeId: users.nodeId,
        node: orgNodes.name,
      })
      .from(users)
      .leftJoin(orgNodes, eq(users.nodeId, orgNodes.id))
      .where(eq(users.tenantId, tenantId));
    const pending = await db
      .select({ id: invites.id, email: invites.email, role: invites.role, createdAt: invites.createdAt })
      .from(invites)
      .where(and(eq(invites.tenantId, tenantId), isNull(invites.acceptedAt)));
    const [tenant] = await db.select({ mode: tenants.registrationMode }).from(tenants).where(eq(tenants.id, tenantId));
    return { members: memberRows, pending, registrationMode: tenant?.mode ?? "INVITE_ONLY" };
  });

  // Admin: switch the deployment between invite-only and open self-registration.
  app.post("/api/members/registration-mode", adminOnly, async (req, reply) => {
    const body = z.object({ mode: z.enum(["INVITE_ONLY", "OPEN"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await db.update(tenants).set({ registrationMode: body.data.mode }).where(eq(tenants.id, req.currentUser!.tenantId));
    await recordAudit({ action: "tenant.registration_mode", tenantId: req.currentUser!.tenantId, actorId: req.currentUser!.id, meta: { mode: body.data.mode } });
    return { ok: true };
  });

  // Approve / reject a PENDING (self-registered) account — admins or anyone with member.approve.
  for (const action of ["approve", "reject"] as const) {
    app.post<{ Params: { id: string } }>(`/api/members/:id/${action}`, { preHandler: requireAuth }, async (req, reply) => {
      const me = req.currentUser!;
      if (!(await can(me, "member.approve"))) return reply.code(403).send({ error: "not_allowed" });
      const [u] = await db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.tenantId, me.tenantId)));
      if (!u || u.status !== "PENDING") return reply.code(404).send({ error: "not_found" });
      await db.update(users).set({ status: action === "approve" ? "ACTIVE" : "DISABLED" }).where(eq(users.id, u.id));
      await recordAudit({ action: `member.${action === "approve" ? "approved" : "rejected"}`, tenantId: me.tenantId, actorId: me.id, meta: { memberId: u.id, email: u.email } });
      return { ok: true };
    });
  }

  // Admin: set (or clear) a member's home department/node.
  app.patch<{ Params: { id: string } }>("/api/members/:id", adminOnly, async (req, reply) => {
    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const tenantId = req.currentUser!.tenantId;
    const { nodeId } = parsed.data;

    if (nodeId) {
      const [node] = await db
        .select({ id: orgNodes.id })
        .from(orgNodes)
        .where(and(eq(orgNodes.id, nodeId), eq(orgNodes.tenantId, tenantId)));
      if (!node) return reply.code(400).send({ error: "invalid_node" });
    }
    await db
      .update(users)
      .set({ nodeId })
      .where(and(eq(users.id, req.params.id), eq(users.tenantId, tenantId)));
    await recordAudit({ action: "member.node_changed", tenantId, actorId: req.currentUser!.id, meta: { memberId: req.params.id, nodeId } });
    return { ok: true };
  });

  // Admin: invite someone by email.
  app.post("/api/members/invite", { ...adminOnly, ...authLimit }, async (req, reply) => {
    const parsed = inviteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.toLowerCase();
    const tenantId = req.currentUser!.tenantId;

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) return reply.code(409).send({ error: "user_exists" });

    const token = randomBytes(32).toString("hex");
    await db.insert(invites).values({
      tenantId,
      email,
      role: parsed.data.role,
      token,
      invitedBy: req.currentUser!.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    const link = `${env.appUrl}/accept-invite?token=${token}`;
    await sendEmail({
      to: email,
      subject: "You've been invited to CES",
      html: `<p>You've been invited to join CES.</p><p><a href="${link}">Accept your invite and set a password</a></p>`,
    });
    await recordAudit({ action: "member.invited", tenantId, actorId: req.currentUser!.id, meta: { email, role: parsed.data.role } });
    return { ok: true };
  });

  // Admin: revoke a pending invite.
  app.delete<{ Params: { id: string } }>("/api/members/invites/:id", adminOnly, async (req) => {
    const tenantId = req.currentUser!.tenantId;
    await db
      .delete(invites)
      .where(and(eq(invites.id, req.params.id), eq(invites.tenantId, tenantId), isNull(invites.acceptedAt)));
    return { ok: true };
  });

  // Admin: resend a pending invite (same token, refreshed expiry).
  app.post<{ Params: { id: string } }>(
    "/api/members/invites/:id/resend",
    { ...adminOnly, ...authLimit },
    async (req, reply) => {
      const tenantId = req.currentUser!.tenantId;
      const [invite] = await db
        .select()
        .from(invites)
        .where(and(eq(invites.id, req.params.id), eq(invites.tenantId, tenantId), isNull(invites.acceptedAt)))
        .limit(1);
      if (!invite) return reply.code(404).send({ error: "not_found" });

      await db
        .update(invites)
        .set({ expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
        .where(eq(invites.id, invite.id));
      const link = `${env.appUrl}/accept-invite?token=${invite.token}`;
      await sendEmail({
        to: invite.email,
        subject: "Your CES invite (resent)",
        html: `<p>You've been invited to join CES.</p><p><a href="${link}">Accept your invite and set a password</a></p>`,
      });
      return { ok: true };
    },
  );

  // Public: show the invite's email so the accept page can display it.
  app.get<{ Params: { token: string } }>("/api/invite/:token", async (req, reply) => {
    const invite = await findUsableInvite(req.params.token);
    if (!invite) return reply.code(404).send({ error: "invalid_invite" });
    return { email: invite.email };
  });

  // Public: accept an invite, set a password, become a user, and log in.
  app.post("/api/invite/accept", authLimit, async (req, reply) => {
    const parsed = acceptBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const invite = await findUsableInvite(parsed.data.token);
    if (!invite) return reply.code(404).send({ error: "invalid_invite" });

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email));
    if (existing) return reply.code(409).send({ error: "user_exists" });

    const [user] = await db
      .insert(users)
      .values({
        tenantId: invite.tenantId,
        email: invite.email,
        displayName: parsed.data.displayName,
        passwordHash: await hashPassword(parsed.data.password),
        role: invite.role,
        emailVerified: true, // they proved control of the inbox by using the link
      })
      .returning();
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

    setSession(reply, user.id);
    return { user: { email: user.email, displayName: user.displayName, role: user.role } };
  });
}

async function findUsableInvite(token: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}
