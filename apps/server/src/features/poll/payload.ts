import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pollVotes, users } from "../../db/schema.js";

type Activity = { id: string; title: string; config: { pollOptions?: string[]; anonymity?: string; resultsVisibility?: string; chartType?: string; pollCloseAt?: string; pollClosed?: boolean } | null };

async function votesFor(activityId: string) {
  return db
    .select({ optionIndex: pollVotes.optionIndex, voterId: pollVotes.voterId, name: users.displayName })
    .from(pollVotes)
    .innerJoin(users, eq(users.id, pollVotes.voterId))
    .where(eq(pollVotes.activityId, activityId));
}

// Live poll payload, tailored to the viewer. Individual votes are exposed per the anonymity setting.
export async function buildPollPayload(activity: Activity, meId: string, canControl: boolean) {
  const cfg = activity.config ?? {};
  const options = cfg.pollOptions ?? [];
  const anonymity = cfg.anonymity ?? "ANON_ROOM";
  const visibility = cfg.resultsVisibility ?? "LIVE";
  const closed = !!cfg.pollClosed;
  const votes = await votesFor(activity.id);
  const counts = options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
  const myVote = votes.find((v) => v.voterId === meId)?.optionIndex ?? null;

  const showResults = canControl || closed || visibility === "LIVE" || (visibility === "AFTER_VOTE" && myVote !== null);
  let voters: { name: string; optionIndex: number }[] | null = null;
  if (showResults) {
    if (anonymity === "NAMED") voters = votes.map((v) => ({ name: v.name, optionIndex: v.optionIndex }));
    else if (anonymity === "ANON_ROOM" && canControl) voters = votes.map((v) => ({ name: v.name, optionIndex: v.optionIndex }));
  }

  return {
    question: activity.title,
    chartType: cfg.chartType ?? "BAR",
    anonymity,
    resultsVisibility: visibility,
    closed,
    closeAt: cfg.pollCloseAt ?? null,
    options: options.map((label, index) => ({ index, label, count: counts[index] })),
    totalVotes: votes.length,
    myVote,
    showResults,
    voters,
    canExport: canControl,
  };
}

// Final counts for the session log.
export async function pollResults(activity: Activity) {
  const options = activity.config?.pollOptions ?? [];
  const votes = await votesFor(activity.id);
  return {
    question: activity.title,
    chartType: activity.config?.chartType ?? "BAR",
    total: votes.length,
    options: options.map((label, i) => ({ label, count: votes.filter((v) => v.optionIndex === i).length })),
  };
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV export — per-voter rows unless fully anonymous (then counts only), regardless of who exports.
export async function pollCsv(activity: Activity): Promise<string> {
  const cfg = activity.config ?? {};
  const options = cfg.pollOptions ?? [];
  const votes = await votesFor(activity.id);
  if ((cfg.anonymity ?? "ANON_ROOM") === "ANON_ALL") {
    const lines = ["Option,Votes", ...options.map((o, i) => `${csvCell(o)},${votes.filter((v) => v.optionIndex === i).length}`)];
    return lines.join("\n");
  }
  const lines = ["Voter,Option", ...votes.map((v) => `${csvCell(v.name)},${csvCell(options[v.optionIndex] ?? String(v.optionIndex))}`)];
  return lines.join("\n");
}
