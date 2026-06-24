import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  statsEvents, users, orgNodes, pointsLedger, recognitions, recognitionLikes, sessions, sessionParticipants, wellnessCheckins,
  suggestions, redemptions, marketplaceItems, broadcasts, broadcastAcks, surveys, surveyResponses, surveyQuestions,
  quizzes, quizQuestions, quizAnswers, boards, boardPosts, boardPostComments, taskEvents, lists, listItems, requests,
  events, eventContributions, eventPhotos, tournaments, tournamentMatches, achievements, achievementAwards, activities,
} from "../../db/schema.js";
import { requireAuth } from "../../auth.js";
import { hasScope } from "../../lib/capabilities.js";
import { userNodeId } from "../../lib/orgScope.js";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86400_000));
const lastNDays = (n: number) => Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
const num = (x: unknown) => Number(x ?? 0);
const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0); // capped: denominators are *current* active members
// The last n Monday-anchored week starts (oldest→newest), matching Postgres date_trunc('week', …).
const weeksBack = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (n - 1 - i) * 7); return d.toISOString().slice(0, 10); });
const weekSeries = (weeks: string[], rows: { wk: string; n: number }[]) => { const m = new Map(rows.map((r) => [r.wk, num(r.n)])); return weeks.map((w) => ({ week: w, count: num(m.get(w)) })); };

// A viewer's reach. ORG (admins) → whole tenant (users/nodes null = unrestricted). NODE (a section
// manager) → only their org subtree: the people and nodes they oversee. Everything people-centric is
// filtered to `users`; wellness to `nodes`; tool tables to their creators within `users`.
type Scope = { level: "ALL" | "NODE"; users: string[] | null; nodes: string[] | null };
type Me = { id: string; tenantId: string; role: string; nodeId?: string | null };

async function resolveScope(me: Me): Promise<Scope | null> {
  if (await hasScope(me, "stats.view", "ORG")) return { level: "ALL", users: null, nodes: null }; // admins always pass
  if (await hasScope(me, "stats.view", "NODE")) {
    const myNode = me.nodeId ?? (await userNodeId(me.id));
    if (!myNode) return { level: "NODE", users: [me.id], nodes: [] };
    const [home] = await db.select({ path: orgNodes.path }).from(orgNodes).where(and(eq(orgNodes.id, myNode), eq(orgNodes.tenantId, me.tenantId)));
    const subtree = home ? (await db.select({ id: orgNodes.id, path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.tenantId, me.tenantId))).filter((n) => n.path === home.path || n.path.startsWith(`${home.path}.`)).map((n) => n.id) : [];
    const u = subtree.length ? (await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, me.tenantId), inArray(users.nodeId, subtree)))).map((r) => r.id) : [me.id];
    return { level: "NODE", users: u, nodes: subtree };
  }
  return null;
}

export function statsRoutes(app: FastifyInstance) {
  app.post("/api/stats/track", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ surface: z.string().trim().min(1).max(40), refId: z.string().uuid().optional(), kind: z.enum(["VIEW", "INTERACT"]).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    await db.insert(statsEvents).values({ tenantId: me.tenantId, userId: me.id, surface: body.data.surface, refId: body.data.refId ?? null, kind: body.data.kind ?? "VIEW", day: daysAgo(0) });
    return { ok: true };
  });

  // Nav gating: who can see stats and at what level.
  app.get("/api/stats/access", { preHandler: requireAuth }, async (req) => {
    const s = await resolveScope(req.currentUser! as Me);
    return { canView: !!s, level: s?.level ?? null };
  });

  const withScope = (fn: (tid: string, scope: Scope) => Promise<unknown>) => async (req: any, reply: any) => {
    const me = req.currentUser as Me;
    const scope = await resolveScope(me);
    if (!scope) return reply.code(403).send({ error: "forbidden" });
    return fn(me.tenantId, scope);
  };

  app.get("/api/stats", { preHandler: requireAuth }, withScope(async (tid, scope) => ({ generatedDay: daysAgo(0), level: scope.level, ...(await overview(tid, scope)) })));
  app.get("/api/stats/engagement", { preHandler: requireAuth }, withScope((tid, scope) => engagement(tid, scope)));
  app.get("/api/stats/programs", { preHandler: requireAuth }, withScope((tid, scope) => programs(tid, scope)));
  app.get("/api/stats/content", { preHandler: requireAuth }, withScope((tid, scope) => content(tid, scope)));
  app.get("/api/stats/teams", { preHandler: requireAuth }, withScope((tid, scope) => teams(tid, scope)));
  app.get("/api/stats/people", { preHandler: requireAuth }, withScope((tid, scope) => people(tid, scope)));
  app.get("/api/stats/export", { preHandler: requireAuth }, withScope(async (tid, scope) => ({ generatedAt: new Date().toISOString(), scope: scope.level, overview: await overview(tid, scope), engagement: await engagement(tid, scope), programs: await programs(tid, scope), content: await content(tid, scope), teams: await teams(tid, scope) })));
}

// Scope condition helpers: return a WHERE fragment (or undefined → drizzle's and() drops it) so a NODE
// manager only ever sees their slice. ORG (users/nodes null) adds no filter.
const inUsers = (col: any, s: Scope): SQL | undefined => (s.users ? inArray(col, s.users) : undefined);
const inNodes = (col: any, s: Scope): SQL | undefined => (s.nodes ? (s.nodes.length ? inArray(col, s.nodes) : sql`false`) : undefined);
// For tool tables a NODE manager sees only items owned by their people; ORG sees all.
const ownedBy = (col: any, s: Scope) => inUsers(col, s);

async function activeCount(tid: string, s: Scope) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.tenantId, tid), eq(users.status, "ACTIVE"), sql`${users.erasedAt} is null`, inUsers(users.id, s)));
  return num(r?.n);
}

async function overview(tid: string, s: Scope) {
  const days = lastNDays(14), c14 = days[0], c30 = daysAgo(29), today = daysAgo(0);
  const active = await activeCount(tid, s);
  const [{ ci }] = await db.select({ ci: sql<number>`count(distinct ${pointsLedger.userId})::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), eq(pointsLedger.createdDay, today), inUsers(pointsLedger.userId, s)));

  const [pt] = await db.select({ generated: sql<number>`coalesce(sum(case when ${pointsLedger.delta}>0 then ${pointsLedger.delta} else 0 end),0)::int`, spent: sql<number>`coalesce(sum(case when ${pointsLedger.delta}<0 then -${pointsLedger.delta} else 0 end),0)::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), inUsers(pointsLedger.userId, s)));
  const ptDay = await db.select({ day: pointsLedger.createdDay, g: sql<number>`coalesce(sum(case when ${pointsLedger.delta}>0 then ${pointsLedger.delta} else 0 end),0)::int`, s: sql<number>`coalesce(sum(case when ${pointsLedger.delta}<0 then -${pointsLedger.delta} else 0 end),0)::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), gte(pointsLedger.createdDay, c14), inUsers(pointsLedger.userId, s))).groupBy(pointsLedger.createdDay);
  const ptM = new Map(ptDay.map((r) => [r.day, r]));
  const ciDay = await db.select({ day: pointsLedger.createdDay, n: sql<number>`count(distinct ${pointsLedger.userId})::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), gte(pointsLedger.createdDay, c14), inUsers(pointsLedger.userId, s))).groupBy(pointsLedger.createdDay);
  const ciM = new Map(ciDay.map((r) => [r.day, num(r.n)]));

  const logDay = await db.select({ day: statsEvents.day, ok: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN')::int`, fail: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN_FAIL')::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), gte(statsEvents.day, c14), inUsers(statsEvents.userId, s))).groupBy(statsEvents.day);
  const logM = new Map(logDay.map((r) => [r.day, r]));

  const [{ sTotal }] = await db.select({ sTotal: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.tenantId, tid), ownedBy(sessions.creatorId, s)));
  const [{ sHeld }] = await db.select({ sHeld: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.tenantId, tid), eq(sessions.state, "ENDED"), ownedBy(sessions.creatorId, s)));
  const [{ sLive }] = await db.select({ sLive: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.tenantId, tid), eq(sessions.state, "LIVE"), ownedBy(sessions.creatorId, s)));
  const sDay = await db.select({ day: sql<string>`(${sessions.createdAt})::date::text`, n: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.tenantId, tid), gte(sql`(${sessions.createdAt})::date`, c14), ownedBy(sessions.creatorId, s))).groupBy(sql`(${sessions.createdAt})::date::text`);
  const sM = new Map(sDay.map((r) => [r.day, num(r.n)]));
  // In-meeting reach: distinct people who actually joined a session (covers phone/join-web joiners too,
  // since they're recorded as participants — no separate tracking needed).
  const [{ joiners }] = await db.select({ joiners: sql<number>`count(distinct ${sessionParticipants.userId})::int` }).from(sessionParticipants).innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId)).where(and(eq(sessions.tenantId, tid), inUsers(sessionParticipants.userId, s)));

  const areas = await db.select({ surface: statsEvents.surface, views: sql<number>`count(*)::int`, reach: sql<number>`count(distinct ${statsEvents.userId})::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.kind, "VIEW"), gte(statsEvents.day, c30), inUsers(statsEvents.userId, s))).groupBy(statsEvents.surface).orderBy(desc(sql`count(*)`)).limit(8);

  // Member growth: sign-ups per day + how many accounts are currently disabled.
  const memDay = await db.select({ day: sql<string>`(${users.createdAt})::date::text`, n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.tenantId, tid), gte(sql`(${users.createdAt})::date`, c14), inUsers(users.id, s))).groupBy(sql`(${users.createdAt})::date::text`);
  const memM = new Map(memDay.map((r) => [r.day, num(r.n)]));
  const [{ disabled }] = await db.select({ disabled: sql<number>`count(*)::int` }).from(users).where(and(eq(users.tenantId, tid), eq(users.status, "DISABLED"), inUsers(users.id, s)));

  // Trends: this 14-day window vs the previous one, so a number reads as ▲/▼ not just a value.
  const cPrev = daysAgo(27); // start of the previous 14-day window (days 14..27 ago)
  const windowed = async (where: SQL) => num((await db.select({ n: sql<number>`coalesce(sum(case when ${pointsLedger.delta}>0 then ${pointsLedger.delta} else 0 end),0)::int` }).from(pointsLedger).where(where))[0]?.n);
  const ptCur = await windowed(and(eq(pointsLedger.tenantId, tid), gte(pointsLedger.createdDay, c14), inUsers(pointsLedger.userId, s))!);
  const ptPrev = await windowed(and(eq(pointsLedger.tenantId, tid), gte(pointsLedger.createdDay, cPrev), sql`${pointsLedger.createdDay} < ${c14}`, inUsers(pointsLedger.userId, s))!);
  const ciWin = async (from: string, toExcl?: string) => num((await db.select({ n: sql<number>`count(*)::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), gte(pointsLedger.createdDay, from), toExcl ? sql`${pointsLedger.createdDay} < ${toExcl}` : undefined, inUsers(pointsLedger.userId, s))))[0]?.n);
  const loginWin = async (from: string, toExcl?: string) => num((await db.select({ n: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN')::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), gte(statsEvents.day, from), toExcl ? sql`${statsEvents.day} < ${toExcl}` : undefined, inUsers(statsEvents.userId, s))))[0]?.n);
  const delta = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
  const trends = {
    points: { cur: ptCur, prev: ptPrev, deltaPct: delta(ptCur, ptPrev) },
    checkins: { cur: await ciWin(c14), prev: await ciWin(cPrev, c14), deltaPct: 0 as number | null },
    logins: { cur: await loginWin(c14), prev: await loginWin(cPrev, c14), deltaPct: 0 as number | null },
  };
  trends.checkins.deltaPct = delta(trends.checkins.cur, trends.checkins.prev);
  trends.logins.deltaPct = delta(trends.logins.cur, trends.logins.prev);

  // At-risk: active members who haven't checked in OR logged in for 14 days (a disengagement signal).
  const activeIds = (await db.select({ id: users.id, name: users.displayName }).from(users).where(and(eq(users.tenantId, tid), eq(users.status, "ACTIVE"), sql`${users.erasedAt} is null`, inUsers(users.id, s))));
  const ciIds = new Set((await db.select({ id: pointsLedger.userId }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), gte(pointsLedger.createdDay, c14)))).map((r) => r.id));
  const loIds = new Set((await db.select({ id: statsEvents.userId }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), eq(statsEvents.kind, "LOGIN"), gte(statsEvents.day, c14)))).map((r) => r.id));
  const atRiskList = activeIds.filter((u) => !ciIds.has(u.id) && !loIds.has(u.id));

  // --- Temperature check: a grouped set of early-warning signals (scoped + anonymity-safe). ---
  type Warn = { key: string; label: string; level: "ok" | "warn" | "alert"; value: string; hint: string };
  const lvl = (alert: boolean, warnC: boolean): Warn["level"] => (alert ? "alert" : warnC ? "warn" : "ok");
  const warnings: Warn[] = [];
  const atPct = pct(atRiskList.length, active);
  warnings.push({ key: "atrisk", label: "Members to check in on", level: lvl(atRiskList.length > 0 && atPct >= 25, atRiskList.length > 0), value: `${atRiskList.length}`, hint: "no check-in/login 14d" });
  // engagement momentum — check-ins this 14d vs the previous 14d
  const dCi = trends.checkins.deltaPct;
  warnings.push({ key: "engagement", label: "Check-in momentum", level: lvl(dCi != null && dCi <= -25, dCi != null && dCi < 0), value: dCi == null ? "—" : `${dCi > 0 ? "+" : ""}${dCi}%`, hint: "vs previous 14 days" });

  // wellbeing — high-stress share over 30d, k≥5
  const [{ wAll, wHigh }] = await db.select({ wAll: sql<number>`count(*)::int`, wHigh: sql<number>`count(*) filter (where ${wellnessCheckins.stress} >= 4)::int` }).from(wellnessCheckins).where(and(eq(wellnessCheckins.tenantId, tid), gte(wellnessCheckins.createdDay, c30), inNodes(wellnessCheckins.nodeId, s)));
  const wHighPct = num(wAll) >= 5 ? pct(num(wHigh), num(wAll)) : null;
  warnings.push({ key: "wellbeing", label: "Wellbeing", level: wHighPct == null ? "ok" : lvl(wHighPct >= 50, wHighPct >= 30), value: wHighPct == null ? "—" : `${wHighPct}% strained`, hint: wHighPct == null ? "needs 5+ check-ins" : "rated stress 4–5 / 5" });

  // onboarding stall — members who joined in the last 30d and have never checked in
  const newMembers = await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tid), eq(users.status, "ACTIVE"), sql`${users.erasedAt} is null`, gte(users.createdAt, new Date(Date.now() - 30 * 86400_000)), inUsers(users.id, s)));
  const everCi = new Set((await db.select({ u: pointsLedger.userId }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), inUsers(pointsLedger.userId, s))).groupBy(pointsLedger.userId)).map((r) => r.u));
  const stalled = newMembers.filter((m) => !everCi.has(m.id)).length;
  warnings.push({ key: "onboarding", label: "New members not started", level: lvl(false, stalled > 0), value: `${stalled}`, hint: "joined ≤30d, no check-in yet" });

  // ORG-only signals (a team manager can't be shown org-wide security/feedback counts).
  if (s.level === "ALL") {
    const [{ uc }] = await db.select({ uc: sql<number>`count(*)::int` }).from(suggestions).where(and(eq(suggestions.tenantId, tid), eq(suggestions.urgent, true), sql`${suggestions.status} not in ('DONE','DECLINED')`));
    warnings.push({ key: "urgent", label: "Urgent complaints open", level: lvl(num(uc) > 0, false), value: `${num(uc)}`, hint: "flagged safety/harm" });
    const [{ fl }] = await db.select({ fl: sql<number>`count(*)::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), eq(statsEvents.kind, "LOGIN_FAIL"), gte(statsEvents.day, daysAgo(6))));
    warnings.push({ key: "logins", label: "Failed logins (7d)", level: lvl(num(fl) >= 50, num(fl) >= 10), value: `${num(fl)}`, hint: "wrong password on real accounts" });
    const [{ ar }] = await db.select({ ar: sql<number>`count(*)::int` }).from(requests).where(and(eq(requests.tenantId, tid), eq(requests.status, "PENDING"), sql`${requests.createdAt} < now() - interval '7 days'`));
    warnings.push({ key: "requests", label: "Approvals waiting >7d", level: lvl(false, num(ar) > 0), value: `${num(ar)}`, hint: "pending requests" });
  }

  // Weekly-active % (a check-in or login in the last 7 days) + engagement tiers by check-in recency.
  const c7 = daysAgo(6);
  const wkCi = (await db.select({ u: pointsLedger.userId }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), gte(pointsLedger.createdDay, c7), inUsers(pointsLedger.userId, s)))).map((r) => r.u);
  const wkLo = (await db.select({ u: statsEvents.userId }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), eq(statsEvents.kind, "LOGIN"), gte(statsEvents.day, c7), inUsers(statsEvents.userId, s)))).map((r) => r.u);
  const wau = new Set([...wkCi, ...wkLo].filter(Boolean));
  const lastCi = new Map((await db.select({ u: pointsLedger.userId, last: sql<string>`max(${pointsLedger.createdDay})::text` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), inUsers(pointsLedger.userId, s))).groupBy(pointsLedger.userId)).map((r) => [r.u, r.last]));
  const tiers = { today: 0, week: 0, month: 0, dormant: 0 };
  for (const u of activeIds) { const last = lastCi.get(u.id); if (!last) tiers.dormant++; else if (last === today) tiers.today++; else if (last >= c7) tiers.week++; else if (last >= c30) tiers.month++; else tiers.dormant++; }

  return {
    people: { active, checkedInToday: num(ci), checkinRatePct: pct(num(ci), active), disabled: num(disabled) },
    engagement: { wauPct: pct(wau.size, active), tiers },
    growth: { perDay: days.map((d) => ({ day: d, count: num(memM.get(d)) })) },
    trends,
    atRisk: { count: atRiskList.length, pct: pct(atRiskList.length, active), sample: atRiskList.slice(0, 12).map((u) => u.name) },
    warnings,
    points: { generated: num(pt?.generated), spent: num(pt?.spent), outstanding: num(pt?.generated) - num(pt?.spent), perDay: days.map((d) => ({ day: d, generated: num(ptM.get(d)?.g), spent: num(ptM.get(d)?.s) })) },
    checkins: { perDay: days.map((d) => ({ day: d, count: num(ciM.get(d)), ratePct: pct(num(ciM.get(d)), active) })) },
    logins: { perDay: days.map((d) => ({ day: d, success: num(logM.get(d)?.ok), failed: num(logM.get(d)?.fail) })) },
    sessions: { total: num(sTotal), held: num(sHeld), live: num(sLive), participants: num(joiners), perDay: days.map((d) => ({ day: d, count: num(sM.get(d)) })) },
    topAreas: areas.map((a) => ({ surface: a.surface, views: num(a.views), reach: num(a.reach), reachPct: pct(num(a.reach), active) })),
  };
}

async function engagement(tid: string, s: Scope) {
  const days = lastNDays(14), c14 = days[0], c30 = daysAgo(29);
  const active = await activeCount(tid, s);
  const byArea = await db.select({ surface: statsEvents.surface, views: sql<number>`count(*)::int`, reach: sql<number>`count(distinct ${statsEvents.userId})::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.kind, "VIEW"), gte(statsEvents.day, c30), inUsers(statsEvents.userId, s))).groupBy(statsEvents.surface).orderBy(desc(sql`count(*)`));

  const items = await db.select({ surface: statsEvents.surface, refId: statsEvents.refId, views: sql<number>`count(*)::int`, reach: sql<number>`count(distinct ${statsEvents.userId})::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.kind, "VIEW"), gte(statsEvents.day, c30), sql`${statsEvents.refId} is not null`, inUsers(statsEvents.userId, s))).groupBy(statsEvents.surface, statsEvents.refId).orderBy(desc(sql`count(*)`)).limit(20);
  const titleFor = async (surface: string, id: string): Promise<string> => {
    const pick = async (tbl: any, col: any) => { const [r] = await db.select({ t: col }).from(tbl).where(eq(tbl.id, id)); return r?.t as string | undefined; };
    if (surface === "boards") return (await pick(boards, boards.title)) ?? id.slice(0, 8);
    if (surface === "surveys") return (await pick(surveys, surveys.title)) ?? id.slice(0, 8);
    if (surface === "quizzes") return (await pick(quizzes, quizzes.title)) ?? id.slice(0, 8);
    if (surface === "sessions") return (await pick(sessions, sessions.title)) ?? id.slice(0, 8);
    if (surface === "shop") return (await pick(marketplaceItems, marketplaceItems.name)) ?? id.slice(0, 8);
    if (surface === "events") return (await pick(events, events.title)) ?? id.slice(0, 8);
    if (surface === "tournaments") return (await pick(tournaments, tournaments.title)) ?? id.slice(0, 8);
    if (surface === "lists") return (await pick(lists, lists.title)) ?? id.slice(0, 8);
    if (surface === "announcements") return (await pick(broadcasts, broadcasts.title)) ?? id.slice(0, 8);
    return id.slice(0, 8);
  };
  const topItems = [];
  for (const it of items) topItems.push({ surface: it.surface, title: await titleFor(it.surface, it.refId!), views: num(it.views), reach: num(it.reach), reachPct: pct(num(it.reach), active) });

  const logDay = await db.select({ day: statsEvents.day, ok: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN')::int`, fail: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN_FAIL')::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), gte(statsEvents.day, c14), inUsers(statsEvents.userId, s))).groupBy(statsEvents.day);
  const logM = new Map(logDay.map((r) => [r.day, r]));
  const [logTot] = await db.select({ ok: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN')::int`, fail: sql<number>`count(*) filter (where ${statsEvents.kind}='LOGIN_FAIL')::int`, distinct: sql<number>`count(distinct ${statsEvents.userId}) filter (where ${statsEvents.kind}='LOGIN')::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), gte(statsEvents.day, c30), inUsers(statsEvents.userId, s)));

  return {
    byArea: byArea.map((a) => ({ surface: a.surface, views: num(a.views), reach: num(a.reach), reachPct: pct(num(a.reach), active) })),
    topItems,
    logins: { success30: num(logTot?.ok), failed30: num(logTot?.fail), distinctUsers30: num(logTot?.distinct), perDay: days.map((d) => ({ day: d, success: num(logM.get(d)?.ok), failed: num(logM.get(d)?.fail) })) },
  };
}

async function programs(tid: string, s: Scope) {
  const days = lastNDays(14), c14 = days[0], c30 = daysAgo(29), c90 = daysAgo(89);
  const active = await activeCount(tid, s);
  const weeks12 = weeksBack(12), w12 = weeks12[0];
  const [{ rTotal }] = await db.select({ rTotal: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), inUsers(recognitions.toUserId, s)));
  const [{ r30 }] = await db.select({ r30: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), gte(sql`(${recognitions.createdAt})::date`, c30), inUsers(recognitions.toUserId, s)));
  const byBadge = await db.select({ badge: recognitions.badge, n: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), inUsers(recognitions.toUserId, s))).groupBy(recognitions.badge).orderBy(desc(sql`count(*)`));
  const byKind = await db.select({ kind: recognitions.kind, n: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), inUsers(recognitions.toUserId, s))).groupBy(recognitions.kind);
  const recipient = users;
  const topRecipients = await db.select({ name: recipient.displayName, n: sql<number>`count(*)::int` }).from(recognitions).innerJoin(recipient, eq(recipient.id, recognitions.toUserId)).where(and(eq(recognitions.tenantId, tid), eq(recognitions.recipientType, "USER"), inUsers(recognitions.toUserId, s))).groupBy(recipient.displayName).orderBy(desc(sql`count(*)`)).limit(8);
  const [{ likes }] = await db.select({ likes: sql<number>`count(*)::int` }).from(recognitionLikes).innerJoin(recognitions, eq(recognitions.id, recognitionLikes.recognitionId)).where(and(eq(recognitions.tenantId, tid), inUsers(recognitions.toUserId, s)));
  const rDay = await db.select({ day: sql<string>`(${recognitions.createdAt})::date::text`, n: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), gte(sql`(${recognitions.createdAt})::date`, c14), inUsers(recognitions.toUserId, s))).groupBy(sql`(${recognitions.createdAt})::date::text`);
  const rM = new Map(rDay.map((r) => [r.day, num(r.n)]));
  // Coverage (received) + giver participation over 90 days, and a 12-week volume trend.
  const [{ cov }] = await db.select({ cov: sql<number>`count(distinct ${recognitions.toUserId})::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), eq(recognitions.recipientType, "USER"), gte(sql`(${recognitions.createdAt})::date`, c90), inUsers(recognitions.toUserId, s)));
  const [{ giv }] = await db.select({ giv: sql<number>`count(distinct ${recognitions.fromUserId})::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), gte(sql`(${recognitions.createdAt})::date`, c90), inUsers(recognitions.fromUserId, s)));
  const recWk = await db.select({ wk: sql<string>`to_char(date_trunc('week', ${recognitions.createdAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), gte(sql`(${recognitions.createdAt})::date`, w12), inUsers(recognitions.toUserId, s))).groupBy(sql`date_trunc('week', ${recognitions.createdAt})`);
  const recPerWeek = weekSeries(weeks12, recWk);

  const [{ wN, wAvg }] = await db.select({ wN: sql<number>`count(*)::int`, wAvg: sql<number>`coalesce(avg(${wellnessCheckins.stress}),0)::float` }).from(wellnessCheckins).where(and(eq(wellnessCheckins.tenantId, tid), gte(wellnessCheckins.createdDay, c30), inNodes(wellnessCheckins.nodeId, s)));
  const wDist = await db.select({ stress: wellnessCheckins.stress, n: sql<number>`count(*)::int` }).from(wellnessCheckins).where(and(eq(wellnessCheckins.tenantId, tid), gte(wellnessCheckins.createdDay, c30), inNodes(wellnessCheckins.nodeId, s))).groupBy(wellnessCheckins.stress).orderBy(wellnessCheckins.stress);
  const K = 5;
  // 6-week stress trend, k≥5 per week (else locked) — never reveals a small group.
  const wkRows = await db.select({ wk: sql<string>`to_char(date_trunc('week', ${wellnessCheckins.createdDay}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int`, avg: sql<number>`avg(${wellnessCheckins.stress})::float` }).from(wellnessCheckins).where(and(eq(wellnessCheckins.tenantId, tid), gte(wellnessCheckins.createdDay, daysAgo(41)), inNodes(wellnessCheckins.nodeId, s))).groupBy(sql`date_trunc('week', ${wellnessCheckins.createdDay})`);
  const wkM = new Map(wkRows.map((r) => [r.wk, r]));
  const monday = (back: number) => { const d = new Date(); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day - back * 7); return d.toISOString().slice(0, 10); };
  const trend = Array.from({ length: 6 }, (_, i) => { const wk = monday(5 - i); const r = wkM.get(wk); const n = num(r?.n); return { week: wk, avgStress: n >= K ? Math.round(num(r?.avg) * 10) / 10 : null, locked: n < K }; });
  // Wellness check-in volume per week (participation, not a per-person rate — wellness has no identity).
  const welWk = await db.select({ wk: sql<string>`to_char(date_trunc('week', ${wellnessCheckins.createdDay}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(wellnessCheckins).where(and(eq(wellnessCheckins.tenantId, tid), gte(wellnessCheckins.createdDay, w12), inNodes(wellnessCheckins.nodeId, s))).groupBy(sql`date_trunc('week', ${wellnessCheckins.createdDay})`);
  const checkinsPerWeek = weekSeries(weeks12, welWk);
  const wellness = { count30: num(wN), avgStress: num(wN) >= K ? Math.round(num(wAvg) * 10) / 10 : null, distribution: num(wN) >= K ? [1, 2, 3, 4, 5].map((x) => ({ stress: x, n: num(wDist.find((d) => d.stress === x)?.n) })) : [], trend, checkinsPerWeek };

  const sRows = await db.select().from(surveys).where(and(eq(surveys.tenantId, tid), ownedBy(surveys.createdBy, s))).orderBy(desc(surveys.createdAt)).limit(20);
  const surveyStats = [];
  for (const sv of sRows) {
    const [{ qn }] = await db.select({ qn: sql<number>`count(*)::int` }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, sv.id));
    const pages = Math.max(1, Math.ceil(num(qn) / Math.max(1, sv.perPage)));
    const resp = await db.select({ status: surveyResponses.status, page: surveyResponses.page }).from(surveyResponses).where(eq(surveyResponses.surveyId, sv.id));
    const started = resp.length, completed = resp.filter((r) => r.status === "SUBMITTED").length;
    const [{ views }] = await db.select({ views: sql<number>`count(distinct ${statsEvents.userId})::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "surveys"), eq(statsEvents.refId, sv.id)));
    const avgProgress = started ? Math.round(resp.reduce((a, r) => a + (r.status === "SUBMITTED" ? 100 : Math.round((r.page / pages) * 100)), 0) / started) : 0;
    surveyStats.push({ title: sv.title, status: sv.status, views: num(views), started, completed, completionPct: pct(completed, started), avgProgressPct: avgProgress });
  }

  return {
    recognition: { total: num(rTotal), last30: num(r30), likes: num(likes), coveragePct: pct(num(cov), active), giverPct: pct(num(giv), active), byBadge: byBadge.map((b) => ({ badge: b.badge, n: num(b.n) })), byKind: byKind.map((k) => ({ kind: k.kind, n: num(k.n) })), topRecipients: topRecipients.map((t) => ({ name: t.name, n: num(t.n) })), perDay: days.map((d) => ({ day: d, count: num(rM.get(d)) })), perWeek: recPerWeek },
    wellness,
    surveys: surveyStats,
  };
}

// Per-member statistics for the People section — searchable/filterable on the client. Scoped: a NODE
// manager sees only their team. Derived via a handful of grouped queries (no per-user N+1).
async function people(tid: string, s: Scope) {
  const c14 = daysAgo(13), c30 = daysAgo(29);
  const members = await db.select({ id: users.id, name: users.displayName, jobTitle: users.jobTitle, nodeId: users.nodeId, dept: orgNodes.name })
    .from(users).leftJoin(orgNodes, eq(users.nodeId, orgNodes.id))
    .where(and(eq(users.tenantId, tid), eq(users.status, "ACTIVE"), sql`${users.erasedAt} is null`, inUsers(users.id, s)));
  if (!members.length) return { people: [], departments: [] };

  const bal = new Map((await db.select({ u: pointsLedger.userId, n: sql<number>`coalesce(sum(${pointsLedger.delta}),0)::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), inUsers(pointsLedger.userId, s))).groupBy(pointsLedger.userId)).map((r) => [r.u, num(r.n)]));
  const ci = new Map((await db.select({ u: pointsLedger.userId, last: sql<string>`max(${pointsLedger.createdDay})::text`, c30: sql<number>`count(*) filter (where ${pointsLedger.createdDay} >= ${c30})::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), inUsers(pointsLedger.userId, s))).groupBy(pointsLedger.userId)).map((r) => [r.u, r]));
  const rec = new Map((await db.select({ u: recognitions.toUserId, n: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), eq(recognitions.recipientType, "USER"), inUsers(recognitions.toUserId, s))).groupBy(recognitions.toUserId)).map((r) => [r.u, num(r.n)]));
  const lastLogin = new Map((await db.select({ u: statsEvents.userId, last: sql<string>`max(${statsEvents.day})::text` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "login"), eq(statsEvents.kind, "LOGIN"), inUsers(statsEvents.userId, s))).groupBy(statsEvents.userId)).map((r) => [r.u, r.last]));

  const list = members.map((m) => {
    const c = ci.get(m.id);
    const lastCheckin = c?.last ?? null;
    const lastLog = lastLogin.get(m.id) ?? null;
    const atRisk = (!lastCheckin || lastCheckin < c14) && (!lastLog || lastLog < c14);
    return { id: m.id, name: m.name, jobTitle: m.jobTitle, dept: m.dept, points: bal.get(m.id) ?? 0, lastCheckin, checkins30: num(c?.c30), recognition: rec.get(m.id) ?? 0, lastLogin: lastLog, atRisk };
  }).sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || a.name.localeCompare(b.name));
  const departments = [...new Set(members.map((m) => m.dept).filter(Boolean))].sort();
  return { people: list, departments };
}

// Department comparison (ORG viewers only). Compares the top-level units under the org root on the
// metrics that matter — headcount, recent check-in engagement, recognition, and wellbeing (k≥5).
async function teams(tid: string, s: Scope) {
  if (s.level !== "ALL") return { departments: [] }; // a team manager can't compare other teams
  const c14 = daysAgo(13), c30 = daysAgo(29), K = 5;
  const nodes = await db.select({ id: orgNodes.id, parentId: orgNodes.parentId, name: orgNodes.name, path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.tenantId, tid));
  if (!nodes.length) return { departments: [] };
  const root = nodes.find((n) => !n.parentId) ?? nodes.reduce((a, b) => (a.path.length <= b.path.length ? a : b));
  const tops = nodes.filter((n) => n.parentId === root.id);
  const out = [];
  for (const top of tops) {
    const subIds = nodes.filter((n) => n.path === top.path || n.path.startsWith(`${top.path}.`)).map((n) => n.id);
    if (!subIds.length) continue;
    const memberIds = (await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tid), eq(users.status, "ACTIVE"), inArray(users.nodeId, subIds)))).map((r) => r.id);
    if (!memberIds.length) { out.push({ name: top.name, headcount: 0, checkinRatePct: 0, recognition: 0, avgWellness: null }); continue; }
    const [{ ci }] = await db.select({ ci: sql<number>`count(distinct ${pointsLedger.userId})::int` }).from(pointsLedger).where(and(eq(pointsLedger.tenantId, tid), eq(pointsLedger.reason, "checkin"), gte(pointsLedger.createdDay, c14), inArray(pointsLedger.userId, memberIds)));
    const [{ rec }] = await db.select({ rec: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tid), eq(recognitions.recipientType, "USER"), inArray(recognitions.toUserId, memberIds)));
    const [{ wN, wAvg }] = await db.select({ wN: sql<number>`count(*)::int`, wAvg: sql<number>`coalesce(avg(${wellnessCheckins.stress}),0)::float` }).from(wellnessCheckins).where(and(eq(wellnessCheckins.tenantId, tid), gte(wellnessCheckins.createdDay, c30), inArray(wellnessCheckins.nodeId, subIds)));
    out.push({ name: top.name, headcount: memberIds.length, checkinRatePct: pct(num(ci), memberIds.length), recognition: num(rec), avgWellness: num(wN) >= K ? Math.round(num(wAvg) * 10) / 10 : null });
  }
  return { departments: out.sort((a, b) => b.checkinRatePct - a.checkinRatePct) };
}

async function nodeReachCount(tid: string, nodeId: string | null, allActive: number) {
  if (!nodeId) return allActive;
  const [t] = await db.select({ path: orgNodes.path }).from(orgNodes).where(eq(orgNodes.id, nodeId));
  if (!t) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).innerJoin(orgNodes, eq(users.nodeId, orgNodes.id)).where(and(eq(users.tenantId, tid), eq(users.status, "ACTIVE"), sql`(${orgNodes.path} = ${t.path} or ${orgNodes.path} like ${t.path + ".%"})`));
  return num(r?.n);
}

async function content(tid: string, s: Scope) {
  const days = lastNDays(14), c14 = days[0];
  const active = await activeCount(tid, s);

  const playedRows = await db.select({ quizId: quizQuestions.quizId, title: quizzes.title, players: sql<number>`count(distinct ${quizAnswers.userId})::int`, correct: sql<number>`sum(case when ${quizAnswers.correct} then 1 else 0 end)::int`, answers: sql<number>`count(*)::int` })
    .from(quizAnswers).innerJoin(quizQuestions, eq(quizQuestions.id, quizAnswers.questionId)).innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
    .where(and(eq(quizzes.tenantId, tid), ownedBy(quizzes.createdBy, s))).groupBy(quizQuestions.quizId, quizzes.title).orderBy(desc(sql`count(distinct ${quizAnswers.userId})`)).limit(10);
  const quizStats = [];
  for (const q of playedRows) {
    const [win] = await db.select({ name: users.displayName, pts: sql<number>`sum(${quizAnswers.points})::int` }).from(quizAnswers).innerJoin(quizQuestions, eq(quizQuestions.id, quizAnswers.questionId)).innerJoin(users, eq(users.id, quizAnswers.userId)).where(eq(quizQuestions.quizId, q.quizId)).groupBy(users.displayName).orderBy(desc(sql`sum(${quizAnswers.points})`)).limit(1);
    quizStats.push({ title: q.title, players: num(q.players), avgScorePct: pct(num(q.correct), num(q.answers)), winner: win ? { name: win.name, points: num(win.pts) } : null });
  }

  const [{ posts }] = await db.select({ posts: sql<number>`count(*)::int` }).from(boardPosts).innerJoin(boards, eq(boards.id, boardPosts.boardId)).where(and(eq(boards.tenantId, tid), ownedBy(boards.createdBy, s)));
  const [{ comments }] = await db.select({ comments: sql<number>`count(*)::int` }).from(boardPostComments).innerJoin(boardPosts, eq(boardPosts.id, boardPostComments.postId)).innerJoin(boards, eq(boards.id, boardPosts.boardId)).where(and(eq(boards.tenantId, tid), ownedBy(boards.createdBy, s)));
  const topPosts = await db.select({ title: boardPosts.title, n: sql<number>`count(${boardPostComments.id})::int` }).from(boardPosts).innerJoin(boards, eq(boards.id, boardPosts.boardId)).leftJoin(boardPostComments, eq(boardPostComments.postId, boardPosts.id)).where(and(eq(boards.tenantId, tid), ownedBy(boards.createdBy, s))).groupBy(boardPosts.id, boardPosts.title).orderBy(desc(sql`count(${boardPostComments.id})`)).limit(6);

  const tDay = await db.select({ day: sql<string>`(${taskEvents.createdAt})::date::text`, created: sql<number>`count(*) filter (where ${taskEvents.action}='created')::int`, completed: sql<number>`count(*) filter (where ${taskEvents.action}='completed')::int` }).from(taskEvents).innerJoin(users, eq(users.id, taskEvents.actorId)).where(and(eq(users.tenantId, tid), gte(sql`(${taskEvents.createdAt})::date`, c14), inUsers(taskEvents.actorId, s))).groupBy(sql`(${taskEvents.createdAt})::date::text`);
  const tM = new Map(tDay.map((r) => [r.day, r]));
  const [tTot] = await db.select({ created: sql<number>`count(*) filter (where ${taskEvents.action}='created')::int`, completed: sql<number>`count(*) filter (where ${taskEvents.action}='completed')::int` }).from(taskEvents).innerJoin(users, eq(users.id, taskEvents.actorId)).where(and(eq(users.tenantId, tid), inUsers(taskEvents.actorId, s)));

  const [{ openLists }] = await db.select({ openLists: sql<number>`count(*) filter (where ${lists.status}='OPEN')::int` }).from(lists).where(and(eq(lists.tenantId, tid), ownedBy(lists.createdBy, s)));
  const [li] = await db.select({ total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${listItems.done})::int` }).from(listItems).innerJoin(lists, eq(lists.id, listItems.listId)).where(and(eq(lists.tenantId, tid), ownedBy(lists.createdBy, s)));

  const bRows = await db.select().from(broadcasts).where(and(eq(broadcasts.tenantId, tid), ownedBy(broadcasts.createdBy, s))).orderBy(desc(broadcasts.createdAt)).limit(12);
  const announcements = [];
  for (const b of bRows) {
    const [{ acked }] = await db.select({ acked: sql<number>`count(*)::int` }).from(broadcastAcks).where(eq(broadcastAcks.broadcastId, b.id));
    const [{ seen }] = await db.select({ seen: sql<number>`count(distinct ${statsEvents.userId})::int` }).from(statsEvents).where(and(eq(statsEvents.tenantId, tid), eq(statsEvents.surface, "announcements"), eq(statsEvents.refId, b.id)));
    const recipients = await nodeReachCount(tid, b.scopeKind === "NODE" ? b.scopeId : null, active);
    announcements.push({ title: b.title, requireAck: b.requireAck, recipients, seen: num(seen), seenPct: pct(num(seen), recipients), acked: num(acked), ackPct: pct(num(acked), recipients) });
  }

  const [{ redeemed }] = await db.select({ redeemed: sql<number>`count(*)::int` }).from(redemptions).where(and(eq(redemptions.tenantId, tid), inUsers(redemptions.userId, s)));
  const [{ buyers }] = await db.select({ buyers: sql<number>`count(distinct ${redemptions.userId})::int` }).from(redemptions).where(and(eq(redemptions.tenantId, tid), inUsers(redemptions.userId, s)));
  const [{ revenue }] = await db.select({ revenue: sql<number>`coalesce(sum(${redemptions.cost}),0)::int` }).from(redemptions).where(and(eq(redemptions.tenantId, tid), inUsers(redemptions.userId, s)));
  const byItem = await db.select({ name: redemptions.itemName, n: sql<number>`count(*)::int`, spent: sql<number>`coalesce(sum(${redemptions.cost}),0)::int` }).from(redemptions).where(and(eq(redemptions.tenantId, tid), inUsers(redemptions.userId, s))).groupBy(redemptions.itemName).orderBy(desc(sql`count(*)`)).limit(8);

  const [{ reqTotal }] = await db.select({ reqTotal: sql<number>`count(*)::int` }).from(requests).where(and(eq(requests.tenantId, tid), ownedBy(requests.createdBy, s)));
  const [{ reqPending }] = await db.select({ reqPending: sql<number>`count(*) filter (where ${requests.status}='PENDING')::int` }).from(requests).where(and(eq(requests.tenantId, tid), ownedBy(requests.createdBy, s)));
  const reqDay = await db.select({ day: sql<string>`(${requests.createdAt})::date::text`, n: sql<number>`count(*)::int` }).from(requests).where(and(eq(requests.tenantId, tid), gte(sql`(${requests.createdAt})::date`, c14), ownedBy(requests.createdBy, s))).groupBy(sql`(${requests.createdAt})::date::text`);
  const reqM = new Map(reqDay.map((r) => [r.day, num(r.n)]));

  // Events: count, fundraisers + total contributed, gallery size.
  const [{ evTotal }] = await db.select({ evTotal: sql<number>`count(*)::int` }).from(events).where(and(eq(events.tenantId, tid), ownedBy(events.createdBy, s)));
  const [{ funds }] = await db.select({ funds: sql<number>`count(*) filter (where ${events.kind}='FUND')::int` }).from(events).where(and(eq(events.tenantId, tid), ownedBy(events.createdBy, s)));
  const [{ contributed }] = await db.select({ contributed: sql<number>`coalesce(sum(${eventContributions.amount}),0)::int` }).from(eventContributions).innerJoin(events, eq(events.id, eventContributions.eventId)).where(and(eq(events.tenantId, tid), inUsers(eventContributions.userId, s)));
  const [{ photos }] = await db.select({ photos: sql<number>`count(*)::int` }).from(eventPhotos).innerJoin(events, eq(events.id, eventPhotos.eventId)).where(and(eq(events.tenantId, tid), eq(eventPhotos.hidden, false), ownedBy(events.createdBy, s)));

  // Tournaments: counts + champions (the final-round winner of DONE tournaments).
  const [{ tnTotal }] = await db.select({ tnTotal: sql<number>`count(*)::int` }).from(tournaments).where(and(eq(tournaments.tenantId, tid), ownedBy(tournaments.createdBy, s)));
  const doneTns = await db.select({ id: tournaments.id, title: tournaments.title, game: tournaments.gameLabel }).from(tournaments).where(and(eq(tournaments.tenantId, tid), eq(tournaments.status, "DONE"), ownedBy(tournaments.createdBy, s))).orderBy(desc(tournaments.createdAt)).limit(8);
  const champions = [];
  for (const tn of doneTns) {
    const [fin] = await db.select({ name: users.displayName }).from(tournamentMatches).innerJoin(users, eq(users.id, tournamentMatches.winnerId)).where(eq(tournamentMatches.tournamentId, tn.id)).orderBy(desc(tournamentMatches.round)).limit(1);
    champions.push({ title: tn.title, game: tn.game, winner: fin?.name ?? null });
  }

  // Achievements unlocked by my people + the most-earned ones.
  const [{ awarded }] = await db.select({ awarded: sql<number>`count(*)::int` }).from(achievementAwards).where(and(eq(achievementAwards.tenantId, tid), inUsers(achievementAwards.userId, s)));
  const topAch = await db.select({ name: achievements.name, icon: achievements.icon, n: sql<number>`count(*)::int` }).from(achievementAwards).innerJoin(achievements, eq(achievements.id, achievementAwards.achievementId)).where(and(eq(achievementAwards.tenantId, tid), inUsers(achievementAwards.userId, s))).groupBy(achievements.name, achievements.icon).orderBy(desc(sql`count(*)`)).limit(8);

  // In-session activities run, by type.
  const actByType = await db.select({ type: activities.type, n: sql<number>`count(*)::int` }).from(activities).innerJoin(sessions, eq(sessions.id, activities.sessionId)).where(and(eq(sessions.tenantId, tid), ownedBy(sessions.creatorId, s))).groupBy(activities.type).orderBy(desc(sql`count(*)`));

  // Suggestions are anonymous (no creator) → a NODE manager can't be shown attributed counts; ORG only.
  // Counts use only the coarse created_day (no time/identity), so weekly volume is anonymity-safe.
  let feedback = { suggestions: 0, complaints: 0, open: 0, perDay: days.map((d) => ({ day: d, count: 0 })), complaintsPerWeek: [] as { week: string; count: number }[], adoptionPct: 0, avgResolutionDays: null as number | null, byCategory: [] as { category: string; n: number }[] };
  if (s.level === "ALL") {
    const sug = await db.select({ kind: suggestions.kind, status: suggestions.status, day: suggestions.createdDay, updated: suggestions.updatedDay, category: suggestions.category }).from(suggestions).where(eq(suggestions.tenantId, tid));
    const fbM = new Map<string, number>();
    for (const x of sug) if (x.day >= c14) fbM.set(x.day, (fbM.get(x.day) ?? 0) + 1);
    // Complaints per week — Monday-anchored, last 12 weeks.
    const wkOf = (ds: string) => { const d = new Date(`${ds}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const weeks = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (11 - i) * 7); return d.toISOString().slice(0, 10); });
    const cw = new Map<string, number>();
    for (const x of sug) if (x.kind === "COMPLAINT") { const w = wkOf(x.day); cw.set(w, (cw.get(w) ?? 0) + 1); }
    // Responsiveness: how much feedback was acted on (planned/done) vs declined, and how fast.
    const decided = sug.filter((x) => ["PLANNED", "DONE", "DECLINED"].includes(x.status));
    const adopted = sug.filter((x) => x.status === "PLANNED" || x.status === "DONE").length;
    const resolved = sug.filter((x) => x.updated && ["PLANNED", "DONE", "DECLINED"].includes(x.status));
    const avgRes = resolved.length ? Math.round(resolved.reduce((a, x) => a + Math.max(0, (Date.parse(x.updated!) - Date.parse(x.day)) / 86400_000), 0) / resolved.length) : null;
    const catM = new Map<string, number>();
    for (const x of sug) if (x.kind === "COMPLAINT") { const c = x.category || "OTHER"; catM.set(c, (catM.get(c) ?? 0) + 1); }
    feedback = {
      suggestions: sug.filter((x) => x.kind === "SUGGESTION").length,
      complaints: sug.filter((x) => x.kind === "COMPLAINT").length,
      open: sug.filter((x) => x.status !== "DONE" && x.status !== "DECLINED").length,
      perDay: days.map((d) => ({ day: d, count: num(fbM.get(d)) })),
      complaintsPerWeek: weeks.map((w) => ({ week: w, count: cw.get(w) ?? 0 })),
      adoptionPct: pct(adopted, decided.length),
      avgResolutionDays: avgRes,
      byCategory: [...catM].map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n),
    };
  }

  return {
    quizzes: quizStats,
    boards: { posts: num(posts), comments: num(comments), topPosts: topPosts.map((p) => ({ title: p.title, comments: num(p.n) })) },
    tasks: { created: num(tTot?.created), completed: num(tTot?.completed), perDay: days.map((d) => ({ day: d, created: num(tM.get(d)?.created), completed: num(tM.get(d)?.completed) })) },
    lists: { open: num(openLists), items: num(li?.total), done: num(li?.done), donePct: pct(num(li?.done), num(li?.total)) },
    announcements,
    shop: { redeemed: num(redeemed), pointsSpent: num(revenue), participationPct: pct(num(buyers), active), byItem: byItem.map((i) => ({ name: i.name, count: num(i.n), spent: num(i.spent) })), views: [] as { name: string; views: number }[] },
    requests: { total: num(reqTotal), pending: num(reqPending), perDay: days.map((d) => ({ day: d, count: num(reqM.get(d)) })) },
    events: { total: num(evTotal), fundraisers: num(funds), contributed: num(contributed), photos: num(photos) },
    tournaments: { total: num(tnTotal), champions },
    achievements: { awarded: num(awarded), top: topAch.map((a) => ({ name: a.name, icon: a.icon, n: num(a.n) })) },
    activities: actByType.map((a) => ({ type: a.type, n: num(a.n) })),
    feedback,
  };
}
