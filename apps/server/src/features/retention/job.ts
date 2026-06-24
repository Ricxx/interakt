import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { retentionSettings, suggestions, suggestionVotes, wellnessCheckins, users } from "../../db/schema.js";
import { recordAudit } from "../../lib/audit.js";
import { anonymizeUser } from "./anonymize.js";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86400_000));
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return ymd(d); };

// Apply one tenant's retention schedule. Returns what was purged. Audit/ledger tables are deliberately
// never touched here (append-only integrity). Safe to run repeatedly — every step is bounded by a cutoff.
export async function runRetentionForTenant(tenantId: string): Promise<{ complaints: number; wellness: number; erased: number } | null> {
  const [s] = await db.select().from(retentionSettings).where(eq(retentionSettings.tenantId, tenantId));
  if (!s || !s.enabled) return null;

  // 1. Resolved suggestions/complaints older than the window (anonymous already — pure hygiene).
  const cMax = monthsAgo(s.complaintsResolvedMonths);
  const stale = await db
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(and(eq(suggestions.tenantId, tenantId), inArray(suggestions.status, ["DONE", "DECLINED"]), lt(suggestions.createdDay, cMax)));
  const ids = stale.map((r) => r.id);
  if (ids.length) {
    await db.delete(suggestionVotes).where(inArray(suggestionVotes.suggestionId, ids));
    await db.delete(suggestions).where(inArray(suggestions.id, ids));
  }

  // 2. Raw wellness check-ins older than the window (aggregates were never row-level identifiable anyway).
  const wDel = await db
    .delete(wellnessCheckins)
    .where(and(eq(wellnessCheckins.tenantId, tenantId), lt(wellnessCheckins.createdDay, daysAgo(s.wellnessRawDays))))
    .returning({ id: wellnessCheckins.id });

  // 3. Anonymize PII of members offboarded longer than the window (and not already erased).
  const cutoff = new Date(Date.now() - s.deactivatedPiiDays * 86400_000);
  const toErase = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.status, "DISABLED"), isNull(users.erasedAt), lt(users.deactivatedAt, cutoff)));
  let erased = 0;
  for (const u of toErase) if (await anonymizeUser(u.id)) erased++;

  const result = { complaints: ids.length, wellness: wDel.length, erased };
  await db.update(retentionSettings).set({ lastRunAt: new Date() }).where(eq(retentionSettings.tenantId, tenantId));
  if (ids.length || wDel.length || erased) {
    // Audit the fact of a purge (counts only — never which items/people).
    await recordAudit({ action: "retention.purged", tenantId, actorId: null, meta: result });
  }
  return result;
}

// Sweep every tenant that has retention switched on. Called on a daily in-process tick (pg-boss is the
// eventual home once it's wired; an interval is the boring MVP and matches the single-box deploy).
export async function runRetentionAllTenants(): Promise<void> {
  const rows = await db.select({ tenantId: retentionSettings.tenantId }).from(retentionSettings).where(eq(retentionSettings.enabled, true));
  for (const r of rows) {
    try { await runRetentionForTenant(r.tenantId); } catch { /* one tenant's failure shouldn't stop the sweep */ }
  }
}
