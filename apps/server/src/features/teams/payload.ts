import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { teamAssignments, users } from "../../db/schema.js";

type Activity = { id: string; config: { teamCount?: number } | null };

async function rowsFor(activityId: string) {
  return db
    .select({ userId: teamAssignments.userId, teamIndex: teamAssignments.teamIndex, name: users.displayName })
    .from(teamAssignments)
    .innerJoin(users, eq(users.id, teamAssignments.userId))
    .where(eq(teamAssignments.activityId, activityId));
}

function group(rows: { userId: string; teamIndex: number; name: string }[], teamCount: number) {
  return Array.from({ length: teamCount }, (_, i) => ({
    index: i,
    name: `Team ${i + 1}`,
    members: rows.filter((r) => r.teamIndex === i).map((r) => ({ id: r.userId, name: r.name })),
  }));
}

export async function buildTeamsPayload(activity: Activity, meId: string) {
  const teamCount = activity.config?.teamCount ?? 2;
  const rows = await rowsFor(activity.id);
  return { teamCount, teams: group(rows, teamCount), myTeam: rows.find((r) => r.userId === meId)?.teamIndex ?? null };
}

// Final teams for the session log.
export async function teamsResults(activity: Activity) {
  const teamCount = activity.config?.teamCount ?? 2;
  return { teams: group(await rowsFor(activity.id), teamCount) };
}
