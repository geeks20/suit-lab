import { and, eq, isNotNull } from "drizzle-orm";
import { generations, users } from "../db/schema";
import { log } from "../log";
import { storageKeys } from "../storage/types";
import type { ServiceContext } from "./context";

export interface DeletionReport {
  storageObjectsDeleted: number;
  /** Provider jobs that ran for this user. Providers without a deletion API keep their own records (see README). */
  providerJobs: { provider: string; count: number }[];
}

/**
 * Deletes the user's photos, models, generations and looks.
 * Storage first: if it fails, the DB rows remain so the request can be retried.
 */
export async function deleteUserData(ctx: ServiceContext, userId: string): Promise<DeletionReport> {
  const jobs = await ctx.db
    .select({ provider: generations.provider })
    .from(generations)
    .where(and(eq(generations.userId, userId), isNotNull(generations.providerJobId), eq(generations.cacheHit, false)));
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.provider, (counts.get(j.provider) ?? 0) + 1);

  const storageObjectsDeleted = await ctx.storage.deletePrefix(storageKeys.userPrefix(userId));
  await ctx.db.delete(users).where(eq(users.id, userId)); // cascades: profiles, generations, looks
  log("info", "user.deleted", { objects: storageObjectsDeleted });
  return { storageObjectsDeleted, providerJobs: [...counts].map(([provider, count]) => ({ provider, count })) };
}
