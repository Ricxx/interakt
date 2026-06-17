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
  { key: "activity.start", category: "Activities", label: "Start activities", scoped: false },
  { key: "activity.manage", category: "Activities", label: "Run / close / reveal activities", scoped: false },
  { key: "task.create", category: "Tasks", label: "Create & assign tasks", scoped: false },
  { key: "task.manage", category: "Tasks", label: "Manage the team task board", scoped: true },
  { key: "repo.view", category: "Repository", label: "View repository", scoped: false },
  { key: "repo.post", category: "Repository", label: "Post to repository", scoped: true },
  { key: "repo.post.links", category: "Repository", label: "Post links (not just text)", scoped: false },
  { key: "repo.approve", category: "Repository", label: "Approve repository items", scoped: true },
  { key: "pin", category: "Repository", label: "Pin notices to boards", scoped: true },
  { key: "member.approve", category: "Governance", label: "Approve members & requests", scoped: false },
  { key: "permission.grant", category: "Governance", label: "Manage permission groups", scoped: false },
] as const;

export const CAPABILITY_CATEGORIES = ["Sessions", "Activities", "Tasks", "Repository", "Governance"] as const;

export const SCOPES = ["SELF", "DEPT", "DIVISION", "ORG"] as const;
type Scope = (typeof SCOPES)[number];
const RANK: Record<Scope, number> = { SELF: 0, DEPT: 1, DIVISION: 2, ORG: 3 };
const SCOPED = new Set<string>(CAPABILITIES.filter((c) => c.scoped).map((c) => c.key));
const NODE_TYPE: Record<Exclude<Scope, "SELF" | "ORG">, string> = { DEPT: "DEPARTMENT", DIVISION: "DIVISION" };

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

// The org node that a scope level resolves to, relative to the user's node (the root of their reach).
async function scopeRoot(tenantId: string, myNodeId: string, level: Scope): Promise<string | null> {
  if (level === "SELF") return myNodeId;
  const nodes = await db.select({ id: orgNodes.id, parentId: orgNodes.parentId, nodeType: orgNodes.nodeType }).from(orgNodes).where(eq(orgNodes.tenantId, tenantId));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(myNodeId) ?? null;
  let last = cur;
  let guard = 0;
  while (cur && guard++ < 30) {
    if (level === "ORG" && !cur.parentId) return cur.id; // topmost ancestor
    if (level !== "ORG" && cur.nodeType === NODE_TYPE[level]) return cur.id;
    last = cur;
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return level === "ORG" ? last?.id ?? null : null; // ORG falls back to the topmost reached
}

// Can this user do `capability`, optionally at `targetNodeId`? Admins: always.
// Boolean caps: held = allowed. Scoped caps: the target must sit within the subtree their level reaches.
export async function can(user: { id: string; tenantId: string; role: string; nodeId?: string | null }, capability: string, targetNodeId?: string): Promise<boolean> {
  if (user.role === "TENANT_ADMIN") return true;
  const caps = await userCaps(user.id);
  if (!caps.has(capability)) return false;
  if (!SCOPED.has(capability) || !targetNodeId) return true;
  const myNode = user.nodeId ?? (await userNodeId(user.id));
  if (!myNode) return false;
  const root = await scopeRoot(user.tenantId, myNode, caps.get(capability) ?? "SELF");
  if (!root) return false;
  return (await ancestorNodes(user.tenantId, targetNodeId)).has(root); // target is in root's subtree
}
