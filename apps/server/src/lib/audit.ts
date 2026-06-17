import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

// THE tracking seam. Features call this one-liner for significant actions; analytics
// is built later as a read-only consumer of this table + the features' own domain data.
// `meta` is a free JSON bag — predicts nothing about future needs.
//
// Anonymity rule (CLAUDE.md §7): never put anonymous-submission content or identity in
// `meta`. Fine for auth/admin actions; for anonymous features, log the event, not the who.
//
// Note: prev-hash read + insert isn't transactionally serialized — fine at pilot volume.
// Tighten (advisory lock or single writer) before heavy concurrency.
type AuditEntry = { action: string; tenantId: string | null; actorId: string | null; meta: Record<string, unknown> | null };

// Deterministic JSON with recursively-sorted keys. Essential because `meta` round-trips through
// jsonb, which does NOT preserve key order — without this the verify-time hash wouldn't match.
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>).sort().reduce((o: Record<string, unknown>, k) => { o[k] = stable((v as Record<string, unknown>)[k]); return o; }, {});
  }
  return v;
}

// The exact hash computation — shared by writing (recordAudit) and verifying the chain,
// so the two can never drift apart.
export function auditHash(prevHash: string | null, e: AuditEntry): string {
  const canonical = JSON.stringify(stable({ action: e.action, tenantId: e.tenantId, actorId: e.actorId, meta: e.meta, prevHash }));
  return createHash("sha256").update((prevHash ?? "") + canonical).digest("hex");
}

export async function recordAudit(e: {
  action: string;
  tenantId?: string | null;
  actorId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  const entry: AuditEntry = { action: e.action, tenantId: e.tenantId ?? null, actorId: e.actorId ?? null, meta: e.meta ?? null };
  const [last] = await db.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.id)).limit(1);
  const prevHash = last?.hash ?? null;
  await db.insert(auditLog).values({ ...entry, prevHash, hash: auditHash(prevHash, entry) });
}
