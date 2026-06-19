import { Client } from "minio";
import { env } from "../env.js";

// The MinIO client wants a bare host (not a URL). Accept either: if MINIO_ENDPOINT is a full URL,
// split out host/port/ssl from it; otherwise use the discrete host/port/ssl env values.
function endpoint() {
  const raw = env.storage.endPoint;
  if (raw.includes("://")) { const u = new URL(raw); return { endPoint: u.hostname, port: u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80, useSSL: u.protocol === "https:" }; }
  return { endPoint: raw, port: env.storage.port, useSSL: env.storage.useSSL };
}

// One MinIO client. Uploads are PROXIED through the API (never exposed to clients directly), so the
// object store stays internal — the only surface is the auth-gated /api/uploads routes.
export const storage = new Client({ ...endpoint(), accessKey: env.storage.accessKey, secretKey: env.storage.secretKey });
const BUCKET = env.storage.bucket;

let ensured = false;
export async function ensureBucket() {
  if (ensured) return;
  if (!(await storage.bucketExists(BUCKET))) await storage.makeBucket(BUCKET);
  ensured = true;
}

export async function putUpload(key: string, body: Buffer, contentType: string) {
  await ensureBucket();
  await storage.putObject(BUCKET, key, body, body.length, { "Content-Type": contentType });
}
export async function getUpload(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  try {
    const stat = await storage.statObject(BUCKET, key);
    const stream = await storage.getObject(BUCKET, key);
    return { stream, contentType: stat.metaData?.["content-type"] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
