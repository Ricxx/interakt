import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { scoreboards, scoreboardEntrants, scoreboardScores, scoreboardWatchers } from "../../db/schema.js";
import { env } from "../../env.js";
import { requireAuth } from "../../auth.js";
import { standings } from "./standings.js";

// Signed, expiring public-view token (HMAC) — the token IS the capability to watch one board's standings.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // a retreat day
// canJoin distinguishes a "scan to join" link from a view-only TV/presentation link.
function signToken(scoreboardId: string, canJoin: boolean): string {
  const payload = `${scoreboardId}.${Date.now() + TOKEN_TTL_MS}.${canJoin ? "1" : "0"}`;
  const sig = createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}
function verifyToken(token: string): { id: string; canJoin: boolean } | null {
  let raw: string;
  try { raw = Buffer.from(token, "base64url").toString(); } catch { return null; }
  const i = raw.lastIndexOf("|");
  if (i < 0) return null;
  const payload = raw.slice(0, i), sig = raw.slice(i + 1);
  const expected = createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [id, exp, j] = payload.split(".");
  if (!id || Number(exp) < Date.now()) return null;
  return { id, canJoin: j === "1" };
}
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export function scoreboardRoutes(app: FastifyInstance) {
  async function manageable(id: string, me: { id: string; tenantId: string; role: string }) {
    const [sb] = await db.select().from(scoreboards).where(and(eq(scoreboards.id, id), eq(scoreboards.tenantId, me.tenantId)));
    if (!sb) return null;
    return { sb, canManage: sb.createdBy === me.id || me.role === "TENANT_ADMIN" };
  }

  // Anyone can spin up a scoreboard for their event; the creator runs it.
  app.post("/api/scoreboards", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ title: z.string().trim().min(1).max(120), mode: z.enum(["SOLO", "TEAM"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.currentUser!;
    const [row] = await db.insert(scoreboards).values({ tenantId: me.tenantId, title: body.data.title.trim(), mode: body.data.mode, createdBy: me.id }).returning({ id: scoreboards.id });
    return { id: row.id };
  });

  app.get("/api/scoreboards", { preHandler: requireAuth }, async (req) => {
    const me = req.currentUser!;
    const rows = await db.select().from(scoreboards).where(eq(scoreboards.tenantId, me.tenantId)).orderBy(desc(scoreboards.createdAt)).limit(100);
    const out = [];
    for (const sb of rows) {
      const { standings: s } = await standings(sb.id);
      out.push({ id: sb.id, title: sb.title, mode: sb.mode, entrants: s.length, leader: s[0]?.name ?? null, mine: sb.createdBy === me.id });
    }
    return { scoreboards: out };
  });

  app.get<{ Params: { id: string } }>("/api/scoreboards/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await manageable(id.data, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    const watchers = ctx.sb.mode === "TEAM" ? await db.select({ id: scoreboardWatchers.id, name: scoreboardWatchers.name, entrantId: scoreboardWatchers.entrantId }).from(scoreboardWatchers).where(eq(scoreboardWatchers.scoreboardId, ctx.sb.id)).orderBy(scoreboardWatchers.name) : [];
    return { id: ctx.sb.id, title: ctx.sb.title, mode: ctx.sb.mode, canManage: ctx.canManage, watchers, ...(await standings(ctx.sb.id)) };
  });

  // Organizer manages entrants + scores.
  app.post<{ Params: { id: string } }>("/api/scoreboards/:id/entrants", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80), userId: z.string().uuid().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    await db.insert(scoreboardEntrants).values({ scoreboardId: ctx.sb.id, name: body.data.name.trim(), userId: body.data.userId ?? null });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; entrantId: string } }>("/api/scoreboards/:id/entrants/:entrantId", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    await db.update(scoreboardWatchers).set({ entrantId: null }).where(and(eq(scoreboardWatchers.scoreboardId, ctx.sb.id), eq(scoreboardWatchers.entrantId, req.params.entrantId))); // unassign anyone on this team
    await db.delete(scoreboardScores).where(and(eq(scoreboardScores.scoreboardId, ctx.sb.id), eq(scoreboardScores.entrantId, req.params.entrantId)));
    await db.delete(scoreboardEntrants).where(and(eq(scoreboardEntrants.id, req.params.entrantId), eq(scoreboardEntrants.scoreboardId, ctx.sb.id)));
    return { ok: true };
  });

  // Organizer moves a watcher to a team (or unassigns with a null), and can remove a watcher.
  app.post<{ Params: { id: string; watcherId: string } }>("/api/scoreboards/:id/watchers/:watcherId/move", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ entrantId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    if (body.data.entrantId) {
      const [e] = await db.select({ id: scoreboardEntrants.id }).from(scoreboardEntrants).where(and(eq(scoreboardEntrants.id, body.data.entrantId), eq(scoreboardEntrants.scoreboardId, ctx.sb.id)));
      if (!e) return reply.code(400).send({ error: "unknown_team" });
    }
    await db.update(scoreboardWatchers).set({ entrantId: body.data.entrantId }).where(and(eq(scoreboardWatchers.id, req.params.watcherId), eq(scoreboardWatchers.scoreboardId, ctx.sb.id)));
    return { ok: true };
  });
  app.delete<{ Params: { id: string; watcherId: string } }>("/api/scoreboards/:id/watchers/:watcherId", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    await db.delete(scoreboardWatchers).where(and(eq(scoreboardWatchers.id, req.params.watcherId), eq(scoreboardWatchers.scoreboardId, ctx.sb.id)));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/scoreboards/:id/scores", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ entrantId: z.string().uuid(), game: z.string().trim().max(60).optional(), points: z.number().int().min(-1000).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    const [e] = await db.select({ id: scoreboardEntrants.id }).from(scoreboardEntrants).where(and(eq(scoreboardEntrants.id, body.data.entrantId), eq(scoreboardEntrants.scoreboardId, ctx.sb.id)));
    if (!e) return reply.code(400).send({ error: "unknown_entrant" });
    await db.insert(scoreboardScores).values({ scoreboardId: ctx.sb.id, entrantId: e.id, game: body.data.game?.trim() || "", points: body.data.points, createdBy: req.currentUser!.id });
    return { ok: true };
  });

  // Award points to a SOLO board by name (find-or-create the entrant) — lets a session host top up a
  // person from the room without leaving the meeting. "Points by name, or name entered."
  app.post<{ Params: { id: string } }>("/api/scoreboards/:id/scores-by-name", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80), game: z.string().trim().max(60).optional(), points: z.number().int().min(-1000).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    if (ctx.sb.mode !== "SOLO") return reply.code(409).send({ error: "team_managed" }); // teams: award to a team, not a name
    const name = body.data.name.trim();
    const existing = await db.select({ id: scoreboardEntrants.id, name: scoreboardEntrants.name }).from(scoreboardEntrants).where(eq(scoreboardEntrants.scoreboardId, ctx.sb.id));
    let entrantId = existing.find((e) => e.name.toLowerCase() === name.toLowerCase())?.id;
    if (!entrantId) {
      if (existing.length >= 300) return reply.code(409).send({ error: "full" });
      const [e] = await db.insert(scoreboardEntrants).values({ scoreboardId: ctx.sb.id, name }).returning({ id: scoreboardEntrants.id });
      entrantId = e.id;
    }
    await db.insert(scoreboardScores).values({ scoreboardId: ctx.sb.id, entrantId, game: body.data.game?.trim() || "", points: body.data.points, createdBy: req.currentUser!.id });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; scoreId: string } }>("/api/scoreboards/:id/scores/:scoreId", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    await db.delete(scoreboardScores).where(and(eq(scoreboardScores.id, req.params.scoreId), eq(scoreboardScores.scoreboardId, ctx.sb.id)));
    return { ok: true };
  });

  // Mint a public QR link (organizer only). `?join=1` lets scanners add themselves by name; the default
  // is a view-only link (for a TV / projector — it can watch but never join or get picked).
  app.get<{ Params: { id: string }; Querystring: { join?: string } }>("/api/scoreboards/:id/qr-token", { preHandler: requireAuth }, async (req, reply) => {
    const ctx = await manageable(req.params.id, req.currentUser!);
    if (!ctx) return reply.code(404).send({ error: "not_found" });
    if (!ctx.canManage) return reply.code(403).send({ error: "forbidden" });
    const canJoin = req.query.join === "1" || req.query.join === "true";
    const token = signToken(ctx.sb.id, canJoin);
    const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
    return { token, url: `${proto}://${req.headers.host}/s/${token}`, canJoin };
  });

  // Public live standings JSON (no auth — the token scopes it to one board).
  app.get<{ Params: { token: string } }>("/api/scoreboards/qr/:token", async (req, reply) => {
    const v = verifyToken(req.params.token);
    if (!v) return reply.code(401).send({ error: "bad_token" });
    const [sb] = await db.select({ title: scoreboards.title, mode: scoreboards.mode }).from(scoreboards).where(eq(scoreboards.id, v.id));
    if (!sb) return reply.code(404).send({ error: "not_found" });
    return { title: sb.title, mode: sb.mode, canJoin: v.canJoin, ...(await standings(v.id)) };
  });

  // Public self-join (no auth — a join token is the capability). SOLO → a new entrant; TEAM → a watcher
  // who picks their team (the `standings` list doubles as the team list on the page).
  app.post<{ Params: { token: string } }>("/api/scoreboards/qr/:token/join", async (req, reply) => {
    const v = verifyToken(req.params.token);
    if (!v) return reply.code(401).send({ error: "bad_token" });
    if (!v.canJoin) return reply.code(403).send({ error: "view_only" });
    const body = z.object({ name: z.string().trim().min(1).max(60), entrantId: z.string().uuid().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const [sb] = await db.select().from(scoreboards).where(eq(scoreboards.id, v.id));
    if (!sb) return reply.code(404).send({ error: "not_found" });
    const name = body.data.name.trim();

    if (sb.mode === "TEAM") {
      let entrantId: string | null = null;
      if (body.data.entrantId) {
        const [e] = await db.select({ id: scoreboardEntrants.id }).from(scoreboardEntrants).where(and(eq(scoreboardEntrants.id, body.data.entrantId), eq(scoreboardEntrants.scoreboardId, v.id)));
        if (!e) return reply.code(400).send({ error: "unknown_team" });
        entrantId = e.id;
      }
      const watchers = await db.select({ id: scoreboardWatchers.id }).from(scoreboardWatchers).where(eq(scoreboardWatchers.scoreboardId, v.id));
      if (watchers.length >= 1000) return reply.code(409).send({ error: "full" });
      await db.insert(scoreboardWatchers).values({ scoreboardId: v.id, name, entrantId });
      return { ok: true };
    }

    const existing = await db.select({ id: scoreboardEntrants.id, name: scoreboardEntrants.name }).from(scoreboardEntrants).where(eq(scoreboardEntrants.scoreboardId, v.id));
    if (existing.length >= 300) return reply.code(409).send({ error: "full" });
    if (existing.some((e) => e.name.toLowerCase() === name.toLowerCase())) return { ok: true }; // idempotent
    await db.insert(scoreboardEntrants).values({ scoreboardId: v.id, name });
    return { ok: true };
  });

  // Public scoreboard page (no login) — polls the JSON above and renders the standings.
  app.get<{ Params: { token: string } }>("/s/:token", async (req, reply) => {
    const ok = !!verifyToken(req.params.token);
    const t = esc(req.params.token);
    const body = ok
      ? `<h1 id="title">Scoreboard</h1>
         <form id="join" hidden><input id="nm" placeholder="Your name" maxlength="60" required /><select id="team" hidden></select><button type="submit">Join</button></form>
         <ol id="board" class="board"></ol><p class="muted" id="foot"></p>
         <script>
         const t=${JSON.stringify(req.params.token)};
         const jf=document.getElementById('join'),tm=document.getElementById('team');let joined=false;
         jf.onsubmit=async e=>{e.preventDefault();const nm=document.getElementById('nm');const name=nm.value.trim();if(!name)return;
           const payload={name};if(!tm.hidden&&tm.value)payload.entrantId=tm.value;
           const r=await fetch('/api/scoreboards/qr/'+t+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
           if(r.ok){joined=true;jf.hidden=true;document.getElementById('foot').textContent="✓ You're in, "+name+"!";nm.value='';tick();}};
         async function tick(){
           try{const r=await fetch('/api/scoreboards/qr/'+t);if(!r.ok)throw 0;const d=await r.json();
           document.getElementById('title').textContent='🏆 '+d.title;
           if(d.canJoin&&!joined){jf.hidden=false;if(d.mode==='TEAM'){tm.hidden=false;if(tm.options.length!==d.standings.length){tm.innerHTML=d.standings.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('');}}}
           const medal=['🥇','🥈','🥉'];
           document.getElementById('board').innerHTML=d.standings.map((s,i)=>'<li><span class="rk">'+(medal[i]||(s.rank+'.'))+'</span><span class="nm">'+s.name+'</span><span class="pt">'+s.total+'</span></li>').join('')||'<p class="muted">No scores yet.</p>';
           if(!joined)document.getElementById('foot').textContent=(d.mode==='TEAM'?'Pick your team to join':'Solo')+' · updates live';
           }catch(e){document.getElementById('foot').textContent='Link expired — ask the organiser for a fresh QR.';}
         }
         tick();setInterval(tick,5000);
         </script>`
      : `<h1>Link expired</h1><p class="muted">Ask the organiser for a fresh QR code.</p>`;
    return reply.header("content-type", "text/html; charset=utf-8").send(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scoreboard</title><style>body{font-family:system-ui;max-width:30rem;margin:1.5rem auto;padding:0 1rem}h1{font-size:1.3rem}.muted{color:#64748b;font-size:.85rem}#join{display:flex;gap:.4rem;margin:.5rem 0}#join input{flex:1;padding:.5rem;border:1px solid #cbd5e1;border-radius:.5rem;font-size:1rem}#join select{padding:.5rem;border:1px solid #cbd5e1;border-radius:.5rem;font-size:1rem}#join button{padding:.5rem 1rem;border:0;border-radius:.5rem;background:#4f46e5;color:#fff;font-size:1rem}.board{list-style:none;padding:0;margin:1rem 0}.board li{display:flex;align-items:center;gap:.6rem;padding:.55rem .2rem;border-bottom:1px solid #e2e8f0}.rk{width:1.8rem;text-align:center}.nm{flex:1;font-weight:600}.pt{font-variant-numeric:tabular-nums;font-weight:700;color:#4f46e5}</style></head><body>${body}<!-- token:${t} --></body></html>`,
    );
  });
}
