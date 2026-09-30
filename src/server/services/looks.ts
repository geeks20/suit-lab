import { and, desc, eq } from "drizzle-orm";
import type { AppliedSelection, LookDTO } from "@/lib/api-types";
import { looks, type LookRow } from "../db/schema";
import { AppError, type ServiceContext } from "./context";
import { getOwnedGeneration } from "./generations";

export function nextLookName(existing: string[]): string {
  const used = new Set(existing);
  for (let n = existing.length + 1; ; n++) {
    const name = `Look ${String(n).padStart(2, "0")}`;
    if (!used.has(name)) return name;
  }
}

export async function listLooks(ctx: ServiceContext, userId: string) {
  return ctx.db.select().from(looks).where(eq(looks.userId, userId)).orderBy(desc(looks.createdAt));
}

export async function saveLook(ctx: ServiceContext, userId: string, generationId: string): Promise<{ look: LookRow; alreadySaved: boolean }> {
  const gen = await getOwnedGeneration(ctx, userId, generationId);
  if (gen.status !== "completed" || !gen.outputKey) throw new AppError("not_ready", 409, "Generate the look before saving it.");
  const [existing] = await ctx.db.select().from(looks).where(and(eq(looks.userId, userId), eq(looks.generationId, gen.id))).limit(1);
  if (existing) return { look: existing, alreadySaved: true };
  // A cache hit and its original share an image; treat them as the same saved look.
  const [sameImage] = await ctx.db
    .select()
    .from(looks)
    .where(and(eq(looks.userId, userId), eq(looks.generatedImageKey, gen.outputKey)))
    .limit(1);
  if (sameImage) return { look: sameImage, alreadySaved: true };

  const applied = (gen.inputData as { applied?: AppliedSelection }).applied ?? {};
  const names = (await ctx.db.select({ name: looks.name }).from(looks).where(eq(looks.userId, userId))).map((r) => r.name);
  const [look] = await ctx.db
    .insert(looks)
    .values({
      userId,
      profileId: gen.profileId,
      name: nextLookName(names),
      suitId: applied.suit ?? null,
      shirtId: applied.shirt ?? null,
      tieId: applied.tie ?? null,
      shoesId: applied.shoes ?? null,
      generationId: gen.id,
      generatedImageKey: gen.outputKey,
      createdAt: ctx.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (!look) {
    const [row] = await ctx.db.select().from(looks).where(and(eq(looks.userId, userId), eq(looks.generationId, gen.id))).limit(1);
    return { look: row, alreadySaved: true };
  }
  return { look, alreadySaved: false };
}

export async function renameLook(ctx: ServiceContext, userId: string, id: string, name: unknown) {
  const clean = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!clean) throw new AppError("invalid_name", 400, "Give your look a name.");
  const [row] = await ctx.db.update(looks).set({ name: clean }).where(and(eq(looks.id, id), eq(looks.userId, userId))).returning();
  if (!row) throw new AppError("not_found", 404, "That look couldn't be found.");
  return row;
}

export async function deleteLook(ctx: ServiceContext, userId: string, id: string) {
  const [row] = await ctx.db.delete(looks).where(and(eq(looks.id, id), eq(looks.userId, userId))).returning({ id: looks.id });
  if (!row) throw new AppError("not_found", 404, "That look couldn't be found.");
}

export async function lookDTO(ctx: ServiceContext, row: LookRow): Promise<LookDTO> {
  const selection: AppliedSelection = {};
  if (row.suitId) selection.suit = row.suitId;
  if (row.shirtId) selection.shirt = row.shirtId;
  if (row.tieId) selection.tie = row.tieId;
  if (row.shoesId) selection.shoes = row.shoesId;
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    selection,
    imageUrl: await ctx.storage.signedUrl(row.generatedImageKey, ctx.limits.signedUrlTtlSeconds),
    generationId: row.generationId,
    createdAt: row.createdAt.toISOString(),
  };
}
