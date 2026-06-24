import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { suggestions, suggestionVotes } from "../../db/schema.js";
import { scopeLabel } from "../../lib/scopeAccess.js";

type Activity = { config: { fbKind?: string; fbScopeKind?: string; fbScopeId?: string; fbSpotlight?: number; timerSeconds?: number; timerEndsAt?: string } | null };

// The items in this box (tenant + scope + kind). Anonymous bodies only — no identity is ever returned.
export async function boxItems(tenantId: string, kind: string, scopeKind: string, scopeId: string | null) {
  const conds = [eq(suggestions.tenantId, tenantId), eq(suggestions.kind, kind), eq(suggestions.scopeKind, scopeKind)];
  if (scopeKind === "NODE" && scopeId) conds.push(eq(suggestions.scopeId, scopeId));
  return db.select({ id: suggestions.id, body: suggestions.body, status: suggestions.status, createdDay: suggestions.createdDay }).from(suggestions).where(and(...conds));
}

// Feedback-review payload — the box's anonymous items ranked by votes (top-down), plus timer + spotlight.
export async function buildFeedbackPayload(activity: Activity, meId: string, tenantId: string) {
  const cfg = activity.config ?? {};
  const kind = cfg.fbKind ?? "SUGGESTION";
  const rows = await boxItems(tenantId, kind, cfg.fbScopeKind ?? "ALL", cfg.fbScopeId ?? null);
  const ids = rows.map((r) => r.id);
  const votes = ids.length ? await db.select({ s: suggestionVotes.suggestionId, u: suggestionVotes.userId }).from(suggestionVotes).where(inArray(suggestionVotes.suggestionId, ids)) : [];
  const items = rows
    .map((r) => ({ id: r.id, body: r.body, status: r.status, votes: votes.filter((v) => v.s === r.id).length, myVote: votes.some((v) => v.s === r.id && v.u === meId) }))
    .sort((a, b) => b.votes - a.votes || a.body.localeCompare(b.body));

  return {
    kind,
    scope: await scopeLabel(tenantId, cfg.fbScopeKind ?? "ALL", cfg.fbScopeId ?? null),
    items,
    total: items.length,
    spotlight: cfg.fbSpotlight ?? -1,
    timer: { seconds: cfg.timerSeconds ?? 120, endsAt: cfg.timerEndsAt ?? null, running: !!cfg.timerEndsAt },
  };
}
