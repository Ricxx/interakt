import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";

// Right-to-erasure done the integrity-preserving way: we SCRUB the person's PII from their user row
// but KEEP the row, so the append-only audit log / points ledger / recognitions that reference it stay
// intact and verifiable. This satisfies erasure "to the extent possible" while honouring the
// accountability basis for retaining those immutable records. Idempotent.
export async function anonymizeUser(userId: string): Promise<boolean> {
  const [u] = await db.select({ id: users.id, erasedAt: users.erasedAt }).from(users).where(eq(users.id, userId));
  if (!u || u.erasedAt) return false; // gone or already erased
  await db
    .update(users)
    .set({
      displayName: "Former member",
      email: `erased-${userId}@removed.invalid`, // email is unique + not-null, so we replace rather than null
      avatarUrl: null,
      statusText: null,
      hobbies: null,
      highSchool: null,
      jobTitle: null,
      flair: null,
      title: null,
      nameColor: null,
      passwordHash: null, // can no longer log in
      status: "DISABLED",
      erasedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return true;
}
