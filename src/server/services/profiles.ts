import { and, count, desc, eq, gt } from "drizzle-orm";
import { profileDetailsSchema, type Build, type ProfileDetails } from "@/domain/profile";
import type { ProfileDTO } from "@/lib/api-types";
import { profiles, type ProfileRow } from "../db/schema";
import { normaliseUpload, ImageRejected, UPLOAD_ERROR_MESSAGES } from "../images";
import { storageKeys } from "../storage/types";
import { AppError, type ServiceContext } from "./context";

export const DEMO_IMAGE_PATH = "/demo-assets/model.svg";

export function parseDetails(input: unknown): ProfileDetails {
  const parsed = profileDetailsSchema.safeParse(input);
  if (!parsed.success) throw new AppError("invalid_details", 400, parsed.error.issues[0]?.message ?? "Check your details.");
  return parsed.data;
}

async function checkProfileRate(ctx: ServiceContext, userId: string) {
  const since = new Date(ctx.now().getTime() - 3600_000);
  const [{ n }] = await ctx.db
    .select({ n: count() })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), gt(profiles.createdAt, since)));
  if (n >= ctx.limits.profileUserHourly) {
    throw new AppError("rate_limited", 429, "You've created several models recently. Please try again later.");
  }
}

export async function createProfile(
  ctx: ServiceContext,
  userId: string,
  input: { details: ProfileDetails; photo: { bytes: Buffer; type: string } },
): Promise<ProfileRow> {
  await checkProfileRate(ctx, userId);
  let image;
  try {
    image = await normaliseUpload(input.photo.bytes, input.photo.type);
  } catch (e) {
    if (e instanceof ImageRejected) throw new AppError(`upload_${e.reason}`, 400, UPLOAD_ERROR_MESSAGES[e.reason], e.message);
    throw e;
  }
  const id = crypto.randomUUID();
  const key = storageKeys.profileSource(userId, id);
  await ctx.storage.put(key, image.bytes, "image/jpeg");
  try {
    const [row] = await ctx.db
      .insert(profiles)
      .values({ id, userId, ...input.details, sourceImageKey: key, modelImageKey: key, isDemo: false, createdAt: ctx.now() })
      .returning();
    return row;
  } catch (e) {
    await ctx.storage.delete(key).catch(() => {});
    throw e;
  }
}

export async function createDemoProfile(ctx: ServiceContext, userId: string): Promise<ProfileRow> {
  const [row] = await ctx.db
    .insert(profiles)
    .values({ userId, heightCm: 183, weightKg: 72, build: "slim", isDemo: true, createdAt: ctx.now() })
    .returning();
  return row;
}

export async function getCurrentProfile(ctx: ServiceContext, userId: string): Promise<ProfileRow | null> {
  const rows = await ctx.db.select().from(profiles).where(eq(profiles.userId, userId)).orderBy(desc(profiles.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function getOwnedProfile(ctx: ServiceContext, userId: string, profileId: string): Promise<ProfileRow> {
  const rows = await ctx.db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new AppError("not_found", 404, "Create your model before entering the studio.");
  return rows[0];
}

export async function profileDTO(ctx: ServiceContext, row: ProfileRow): Promise<ProfileDTO> {
  return {
    id: row.id,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    build: row.build as Build,
    isDemo: row.isDemo,
    sourceImageUrl: row.sourceImageKey ? await ctx.storage.signedUrl(row.sourceImageKey, ctx.limits.signedUrlTtlSeconds) : DEMO_IMAGE_PATH,
    createdAt: row.createdAt.toISOString(),
  };
}
