import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, max } from "drizzle-orm";
import { db } from "../../db/client.js";
import { events, eventPhotos } from "../../db/schema.js";
import { env } from "../../env.js";
import { requireAuth } from "../../auth.js";
import { putUpload, getUpload } from "../../lib/storage.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

// Signed, expiring, per-gallery upload token (HMAC). The token IS the capability — a phone that scans
// the QR can add photos to that one event until it expires, with no login. Off unless an organizer mints it.
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
// The whole token is one base64url blob (no dots/slashes) so it's a single clean URL path segment.
function signUploadToken(eventId: string): string {
  const payload = `${eventId}.${Date.now() + TOKEN_TTL_MS}`;
  const sig = createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}
function verifyUploadToken(token: string): string | null {
  let raw: string;
  try { raw = Buffer.from(token, "base64url").toString(); } catch { return null; }
  const i = raw.lastIndexOf("|");
  if (i < 0) return null;
  const payload = raw.slice(0, i), sig = raw.slice(i + 1);
  const expected = createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [eventId, exp] = payload.split(".");
  if (!eventId || Number(exp) < Date.now()) return null;
  return eventId;
}
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export function uploadRoutes(app: FastifyInstance) {
  // Upload an image (multipart). Proxied to MinIO; returns a key + an in-app URL to reference it.
  app.post("/api/uploads", { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (!ALLOWED.has(file.mimetype)) return reply.code(400).send({ error: "unsupported_type" });
    const buf = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: "too_large" });
    const key = `${req.currentUser!.tenantId}/${randomUUID()}.${EXT[file.mimetype]}`;
    await putUpload(key, buf, file.mimetype);
    return { key, url: `/api/uploads/${encodeURIComponent(key)}` };
  });

  // Stream an uploaded image back (auth-gated; keys are random so unguessable). Cached by the browser.
  app.get<{ Params: { "*": string } }>("/api/uploads/*", { preHandler: requireAuth }, async (req, reply) => {
    const key = (req.params as Record<string, string>)["*"];
    const obj = await getUpload(key);
    if (!obj) return reply.code(404).send({ error: "not_found" });
    return reply.header("content-type", obj.contentType).header("cache-control", "private, max-age=86400").send(obj.stream);
  });

  // Organizer mints a QR upload link for a gallery (event creator/admin). The URL points at THIS server
  // (so a phone on the same network can reach it), not the desktop app.
  app.get<{ Params: { id: string } }>("/api/events/:id/upload-token", { preHandler: requireAuth }, async (req, reply) => {
    const me = req.currentUser!;
    const [e] = await db.select({ id: events.id, createdBy: events.createdBy }).from(events).where(and(eq(events.id, req.params.id), eq(events.tenantId, me.tenantId)));
    if (!e) return reply.code(404).send({ error: "not_found" });
    if (e.createdBy !== me.id && me.role !== "TENANT_ADMIN") return reply.code(403).send({ error: "forbidden" });
    const token = signUploadToken(e.id);
    const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
    const url = `${proto}://${req.headers.host}/u/${token}`;
    return { token, url };
  });

  // Public phone-upload page (no login — the token scopes it to one gallery). Self-contained HTML.
  app.get<{ Params: { token: string } }>("/u/:token", async (req, reply) => {
    const ok = !!verifyUploadToken(req.params.token);
    const t = esc(req.params.token);
    const body = ok
      ? `<h1>Add a photo</h1><p>Snap or pick a photo to add to the gallery.</p>
         <form id="f"><input id="file" type="file" accept="image/*" capture="environment" required />
         <button type="submit">Upload</button></form><p id="msg"></p>
         <script>const f=document.getElementById('f'),m=document.getElementById('msg');
         f.onsubmit=async e=>{e.preventDefault();const fl=document.getElementById('file').files[0];if(!fl)return;
         m.textContent='Uploading…';const fd=new FormData();fd.append('file',fl);
         const r=await fetch('/api/uploads/qr/${t}',{method:'POST',body:fd});
         m.textContent=r.ok?'✓ Added! Upload another?':'Upload failed ('+r.status+')';if(r.ok)f.reset();};</script>`
      : `<h1>Link expired</h1><p>Ask the organiser for a fresh QR code.</p>`;
    return reply.header("content-type", "text/html; charset=utf-8").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gallery upload</title><style>body{font-family:system-ui;max-width:30rem;margin:2rem auto;padding:0 1rem}button{padding:.6rem 1rem;font-size:1rem;margin-top:1rem}input{font-size:1rem}</style></head><body>${body}</body></html>`);
  });

  // Token-scoped upload from a phone → adds a photo to the gallery (no auth; token authorizes it).
  app.post<{ Params: { token: string } }>("/api/uploads/qr/:token", async (req, reply) => {
    const eventId = verifyUploadToken(req.params.token);
    if (!eventId) return reply.code(401).send({ error: "bad_token" });
    const [e] = await db.select({ id: events.id, tenantId: events.tenantId, createdBy: events.createdBy }).from(events).where(eq(events.id, eventId));
    if (!e) return reply.code(404).send({ error: "not_found" });
    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
    if (!file || !ALLOWED.has(file.mimetype)) return reply.code(400).send({ error: "unsupported_type" });
    const buf = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: "too_large" });
    const key = `${e.tenantId}/${randomUUID()}.${EXT[file.mimetype]}`;
    await putUpload(key, buf, file.mimetype);
    const [{ n }] = await db.select({ n: max(eventPhotos.number) }).from(eventPhotos).where(eq(eventPhotos.eventId, e.id));
    await db.insert(eventPhotos).values({ eventId: e.id, number: (n ?? 0) + 1, url: `/api/uploads/${encodeURIComponent(key)}`, caption: "via QR", addedBy: e.createdBy });
    return { ok: true };
  });
}
