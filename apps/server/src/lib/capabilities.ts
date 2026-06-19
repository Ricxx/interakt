import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { orgNodes, permissionGroupCaps, permissionGroupParents, userPermissionGroups } from "../db/schema.js";
import { ancestorNodes, userNodeId } from "./orgScope.js";

// The curated capability set, grouped by feature (admins toggle these per permission group).
// `scoped` capabilities carry an org level (how far the right reaches); boolean ones are on/off.
export const CAPABILITIES = [
  { key: "session.join", category: "Sessions", label: "Join sessions", scoped: false },
  { key: "session.schedule", category: "Sessions", label: "Schedule sessions", scoped: false },
  { key: "session.host", category: "Sessions", label: "Host sessions", scoped: false },
  { key: "session.invite", category: "Sessions", label: "Invite people / groups to sessions", scoped: true },
  // NB: activities are governed in-session by session roles (host/co-host/activity-admin) +
  // session.schedule (who can create sessions) — not by an org capability. No activity.* caps.
  { key: "task.create", category: "Tasks", label: "Create & assign tasks", scoped: false },
  { key: "task.manage", category: "Tasks", label: "Manage the team task board", scoped: true },
  { key: "repo.view", category: "Repository", label: "View repository", scoped: false },
  { key: "repo.post", category: "Repository", label: "Post to repository", scoped: true },
  { key: "repo.post.links", category: "Repository", label: "Post links (not just text)", scoped: false },
  { key: "repo.approve", category: "Repository", label: "Approve repository items", scoped: true },
  { key: "pin", category: "Boards", label: "Pin notices to boards", scoped: true },
  { key: "list.create", category: "Lists", label: "Create lists", scoped: false },
  { key: "list.distribute", category: "Lists", label: "Share lists (reach sets how wide)", scoped: true },
  { key: "survey.create", category: "Surveys", label: "Create surveys", scoped: false },
  { key: "survey.distribute", category: "Surveys", label: "Distribute surveys (reach sets how wide)", scoped: true },
  { key: "recognition.award", category: "Recognition", label: "Issue official awards (dept/team/org-wide)", scoped: true },
  { key: "recognition.anonymous", category: "Recognition", label: "Give kudos anonymously", scoped: false },
  { key: "event.manage", category: "Events", label: "Run org-wide events & theme days", scoped: true },
  { key: "tournament.manage", category: "Events", label: "Run org-wide tournaments", scoped: true },
  { key: "reward.manage", category: "Events", label: "Set daily check-in rewards", scoped: false },
  { key: "usage.view", category: "Governance", label: "View the team usage log", scoped: true },
  { key: "member.approve", category: "Governance", label: "Approve members & requests", scoped: false },
  { key: "permission.grant", category: "Governance", label: "Manage permission groups", scoped: false },
] as const;

export const CAPABILITY_CATEGORIES = ["Sessions", "Tasks", "Repository", "Boards", "Lists", "Surveys", "Recognition", "Events", "Governance"] as const;

// Reach is RELATIVE to where the user sits in the org tree — structure-agnostic, so it works for any
// company shape/naming. SELF = no authority over org nodes; NODE = the subtree rooted at the user's
// home node (covers everything beneath them, whatever the levels are called); ORG = the whole tenant.
export const SCOPES = ["SELF", "NODE", "ORG"] as const;
type Scope = (typeof SCOPES)[number];
const RANK: Record<Scope, number> = { SELF: 0, NODE: 1, ORG: 2 };
const SCOPED = new Set<string>(CAPABILITIES.filter((c) => c.scoped).map((c) => c.key));

// Is this user assigned to any permission group? If not, they're "ungoverned" and enforcement
// points fall back to legacy behavior — so turning groups on never silently locks existing users out.
export async function isGoverned(userId: string): Promise<boolean> {
  const [row] = await db.select({ groupId: userPermissionGroups.groupId }).from(userPermissionGroups).where(eq(userPermissionGroups.userId, userId)).limit(1);
  return !!row;
}

// Every group the user is in, plus all groups those inherit from (transitively).
async function effectiveGroupIds(userId: string): Promise<string[]> {
  const direct = (await db.select({ groupId: userPermissionGroups.groupId }).from(userPermissionGroups).where(eq(userPermissionGroups.userId, userId))).map((r) => r.groupId);
  if (!direct.length) return [];
  const edges = await db.select().from(permissionGroupParents);
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) parentsOf.set(e.groupId, [...(parentsOf.get(e.groupId) ?? []), e.parentId]);
  const all = new Set(direct);
  const queue = [...direct];
  let guard = 0;
  while (queue.length && guard++ < 1000) {
    const g = queue.shift()!;
    for (const p of parentsOf.get(g) ?? []) if (!all.has(p)) { all.add(p); queue.push(p); }
  }
  return [...all];
}

// capability → highest scope held across the user's groups + inherited groups (null = boolean cap held).
async function userCaps(userId: string): Promise<Map<string, Scope | null>> {
  const groupIds = await effectiveGroupIds(userId);
  if (!groupIds.length) return new Map();
  const rows = await db.select({ cap: permissionGroupCaps.capability, scope: permissionGroupCaps.scope }).from(permissionGroupCaps).where(inArray(permissionGroupCaps.groupId, groupIds));
  const m = new Map<string, Scope | null>();
  for (const r of rows) {
    if (!SCOPED.has(r.cap)) { m.set(r.cap, null); continue; }
    const s = (r.scope ?? "SELF") as Scope;
    const cur = m.get(r.cap);
    if (cur === undefined || RANK[s] > RANK[cur ?? "SELF"]) m.set(r.cap, s);
  }
  return m;
}

// Can this user do `capability`, optionally at `targetNodeId`? Admins: always.
// Boolean caps: held = allowed. Scoped caps: ORG reaches anywhere; NODE reaches the user's own subtree
// (their home node + all descendants); SELF grants no authority over org nodes.
export async function can(user: { id: string; tenantId: string; role: string; nodeId?: string | null }, capability: string, targetNodeId?: string): Promise<boolean> {
  if (user.role === "TENANT_ADMIN") return true;
  const caps = await userCaps(user.id);
  if (!caps.has(capability)) return false;
  if (!SCOPED.has(capability) || !targetNodeId) return true;
  const held = caps.get(capability) ?? "SELF";
  if (held === "ORG") return true;
  if (held === "SELF") return false;
  const myNode = user.nodeId ?? (await userNodeId(user.id));
  if (!myNode) return false;
  // NODE reach: the target must sit within the subtree rooted at the user's home node.
  return (await ancestorNodes(user.tenantId, targetNodeId)).has(myNode);
}

// Does the user hold `capability` at least at `level` reach? Used for non-node targets like
// "org-wide" where there's no single node to resolve against. Admins always; boolean caps count.
export async function hasScope(user: { id: string; role: string }, capability: string, level: Scope): Promise<boolean> {
  if (user.role === "TENANT_ADMIN") return true;
  const caps = await userCaps(user.id);
  if (!caps.has(capability)) return false;
  const held = caps.get(capability);
  return held == null ? true : RANK[held] >= RANK[level];
}
