import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { pointsLedger, pointsLeaveDays } from "../db/schema.js";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const prev = (day: string) => ymd(new Date(Date.parse(day) - 86400_000));

// A user's current check-in streak: consecutive covered days (check-in or logged leave) ending today
// (if checked in) or yesterday; only check-ins count. Shared by the points calendar + public profiles.
export async function currentStreak(userId: string): Promise<number> {
  const checkin = new Set((await db.select({ d: pointsLedger.createdDay }).from(pointsLedger).where(and(eq(pointsLedger.userId, userId), eq(pointsLedger.reason, "checkin")))).map((r) => r.d));
  const leave = new Set((await db.select({ d: pointsLeaveDays.day }).from(pointsLeaveDays).where(eq(pointsLeaveDays.userId, userId))).map((r) => r.d));
  const t = ymd(new Date());
  let d = checkin.has(t) ? t : prev(t);
  let s = 0, g = 0;
  while ((checkin.has(d) || leave.has(d)) && g++ < 3650) { if (checkin.has(d)) s++; d = prev(d); }
  return s;
}
