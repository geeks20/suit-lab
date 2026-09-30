import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { GARMENT_CATEGORIES, type Garment, type GarmentCategory } from "@/domain/garment";
import { isValidLook, type LookSelection } from "@/domain/look";
import type { Build } from "@/domain/profile";
import type { AppliedSelection, CapabilitiesDTO, GenerationDTO } from "@/lib/api-types";
import { GENERATION_MESSAGES } from "@/lib/messages";
import type { TryOnError, TryOnGarment, TryOnJob, VirtualTryOnProvider } from "@/lib/tryon";
import { garments, generations, type GarmentRow, type GenerationRow, type ProfileRow } from "../db/schema";
import { inspectOutput, toDataUri } from "../images";
import { log } from "../log";
import { storageKeys } from "../storage/types";
import { AppError, type ServiceContext } from "./context";
import { DEMO_IMAGE_PATH, getOwnedProfile } from "./profiles";

const INFLIGHT = ["queued", "processing"] as const;
/** Minimum gap between provider status checks for one generation, whatever the client does. */
export const PROVIDER_POLL_MIN_INTERVAL_MS = 1500;
/** Hosts a provider may return output URLs on (FASHN docs: cdn.fashn.ai, media.fashn.ai). */
const ALLOWED_OUTPUT_HOSTS = new Set(["cdn.fashn.ai", "media.fashn.ai"]);
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;

export function toGarment(row: GarmentRow): Garment {
  return {
    id: row.id,
    category: row.category as GarmentCategory,
    name: row.name,
    color: row.color,
    style: row.style,
    material: row.material,
    formality: row.formality as Garment["formality"],
    imageUrl: row.imageUrl,
    tryOnImageUrl: null,
    metadata: row.metadata as Garment["metadata"],
    active: row.active,
  };
}

function requireProvider(ctx: ServiceContext): VirtualTryOnProvider {
  if (!ctx.provider) throw new AppError("provider_unavailable", 503, GENERATION_MESSAGES.provider_unavailable, "provider not configured");
  return ctx.provider;
}

export async function getCapabilities(ctx: ServiceContext): Promise<CapabilitiesDTO> {
  const p = ctx.provider;
  if (!p) return { provider: "unavailable", realTryOn: false, categories: [], readyGarmentIds: [], demoSupported: false };
  const rows = await ctx.db.select({ id: garments.id, key: garments.tryOnImageKey, category: garments.category }).from(garments).where(eq(garments.active, true));
  const ready = rows.filter((r) => p.capabilities.categories.includes(r.category as GarmentCategory) && (!p.capabilities.requiresGarmentImage || !!r.key));
  return {
    provider: p.id,
    realTryOn: p.capabilities.realTryOn,
    categories: [...p.capabilities.categories],
    readyGarmentIds: ready.map((r) => r.id),
    demoSupported: !p.capabilities.realTryOn,
  };
}

/** Identity of a generation: same identity ⇒ same image, so it can be served from cache. */
export function generationIdentity(parts: {
  profile: Pick<ProfileRow, "id" | "modelImageKey">;
  garments: { id: string; tryOnImageKey: string | null }[];
  provider: Pick<VirtualTryOnProvider, "id" | "model" | "optionsFingerprint">;
}): string {
  const payload = JSON.stringify([
    parts.profile.id,
    parts.profile.modelImageKey ?? "demo",
    parts.garments.map((g) => [g.id, g.tryOnImageKey]),
    parts.provider.id,
    parts.provider.model,
    parts.provider.optionsFingerprint,
  ]);
  return createHash("sha256").update(payload).digest("hex");
}

function appliedLookKey(applied: AppliedSelection): string {
  return GARMENT_CATEGORIES.filter((c) => applied[c]).map((c) => applied[c]).join("|");
}

export async function generationDTO(ctx: ServiceContext, row: GenerationRow): Promise<GenerationDTO> {
  const input = row.inputData as { applied?: AppliedSelection };
  return {
    id: row.id,
    status: row.status as GenerationDTO["status"],
    applied: input.applied ?? {},
    lookKey: row.lookKey,
    imageUrl: row.status === "completed" && row.outputKey ? await ctx.storage.signedUrl(row.outputKey, ctx.limits.signedUrlTtlSeconds) : null,
    errorMessage: row.status === "failed" ? GENERATION_MESSAGES[(row.errorCode as TryOnError["code"]) ?? "provider_failed"] ?? GENERATION_MESSAGES.provider_failed : null,
    cacheHit: row.cacheHit,
    createdAt: row.createdAt.toISOString(),
  };
}

async function enforceRateLimits(ctx: ServiceContext, userId: string, provider: VirtualTryOnProvider) {
  const now = ctx.now().getTime();
  const [{ n: userHour }] = await ctx.db
    .select({ n: count() })
    .from(generations)
    .where(and(eq(generations.userId, userId), eq(generations.cacheHit, false), gt(generations.createdAt, new Date(now - 3600_000))));
  if (userHour >= ctx.limits.generationUserHourly) {
    throw new AppError("rate_limited", 429, "You've generated a lot of looks this hour. Please try again a little later.");
  }
  if (!provider.capabilities.realTryOn) return;
  const [{ n: inFlight }] = await ctx.db
    .select({ n: count() })
    .from(generations)
    .where(and(eq(generations.provider, provider.id), inArray(generations.status, [...INFLIGHT])));
  if (inFlight >= ctx.limits.generationMaxInFlight) {
    throw new AppError("busy", 429, GENERATION_MESSAGES.provider_unavailable, "global in-flight cap reached");
  }
  const [{ n: day }] = await ctx.db
    .select({ n: count() })
    .from(generations)
    .where(and(eq(generations.provider, provider.id), eq(generations.cacheHit, false), gt(generations.createdAt, new Date(now - 86_400_000))));
  if (day >= ctx.limits.generationGlobalDaily) {
    throw new AppError("daily_cap", 429, GENERATION_MESSAGES.provider_unavailable, "global daily cap reached");
  }
}

export interface GenerationRequest {
  profileId: string;
  selection: unknown;
  mockFailure?: boolean;
}

/**
 * Creates (or reuses) a generation. Returns quickly: the provider job runs
 * asynchronously and is advanced by refreshGeneration() when the client polls.
 */
export async function requestGeneration(ctx: ServiceContext, userId: string, req: GenerationRequest): Promise<GenerationRow> {
  const provider = requireProvider(ctx);
  if (!isValidLook(req.selection)) throw new AppError("invalid_selection", 400, "That outfit isn't available.");
  const selection: LookSelection = req.selection;
  const profile = await getOwnedProfile(ctx, userId, req.profileId);
  if (profile.isDemo && provider.capabilities.realTryOn) {
    throw new AppError("demo_unsupported", 422, "Real try-on needs your own photo. Create your model to try it.");
  }

  // Only the categories this provider applies are sent — and recorded as applied.
  const cats = GARMENT_CATEGORIES.filter((c) => provider.capabilities.categories.includes(c)).slice(0, provider.capabilities.maxGarmentsPerCall);
  const ids = cats.map((c) => selection[c]);
  const rows = await ctx.db.select().from(garments).where(inArray(garments.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const used = ids.map((id) => byId.get(id)).filter((g): g is GarmentRow => !!g && g.active);
  if (used.length !== ids.length) throw new AppError("invalid_selection", 400, "That outfit isn't available.");
  if (provider.capabilities.requiresGarmentImage && used.some((g) => !g.tryOnImageKey)) {
    throw new AppError("garment_not_ready", 422, "Real try-on isn't available for this garment yet.");
  }

  const applied: AppliedSelection = Object.fromEntries(used.map((g) => [g.category, g.id]));
  const lookKey = appliedLookKey(applied);
  const requestKey = generationIdentity({ profile, garments: used, provider });

  // 1. Cache: an identical completed generation is reused (recorded as a cache hit, no provider call).
  const [cached] = await ctx.db
    .select()
    .from(generations)
    .where(and(eq(generations.userId, userId), eq(generations.requestKey, requestKey), eq(generations.status, "completed"), eq(generations.cacheHit, false)))
    .orderBy(desc(generations.createdAt))
    .limit(1);
  if (cached?.outputKey && (await ctx.storage.get(cached.outputKey))) {
    const [hit] = await ctx.db
      .insert(generations)
      .values({
        userId,
        profileId: profile.id,
        provider: provider.id,
        providerModel: provider.model,
        providerJobId: cached.providerJobId,
        status: "completed",
        requestKey,
        lookKey,
        inputData: cached.inputData,
        outputKey: cached.outputKey,
        cacheHit: true,
        cachedFromId: cached.id,
        durationMs: 0,
        costCredits: "0",
        createdAt: ctx.now(),
        completedAt: ctx.now(),
      })
      .returning();
    log("info", "generation.cache_hit", { generation_id: hit.id, cached_from: cached.id, provider: provider.id });
    return hit;
  }

  // 2. Dedupe: an identical job already in flight is returned instead of starting another.
  const inflight = await findInflight(ctx, userId, requestKey);
  if (inflight) return inflight;

  await enforceRateLimits(ctx, userId, provider);

  // 3. Create the record. The partial unique index makes concurrent duplicates lose the race safely.
  const inputData = {
    applied,
    garments: used.map((g) => ({ id: g.id, tryOnImageKey: g.tryOnImageKey })),
    options: provider.optionsFingerprint,
    build: profile.build,
  };
  const created = await ctx.db
    .insert(generations)
    .values({
      userId,
      profileId: profile.id,
      provider: provider.id,
      providerModel: provider.model,
      status: "queued",
      requestKey,
      lookKey,
      inputData,
      createdAt: ctx.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (!created[0]) {
    const winner = await findInflight(ctx, userId, requestKey);
    if (winner) return winner;
    throw new AppError("conflict", 409, GENERATION_MESSAGES.provider_unavailable);
  }
  const gen = created[0];

  // 4. Submit to the provider (a fast call; the heavy work happens provider-side).
  let job: TryOnJob;
  try {
    const personImage = await personImageFor(ctx, profile);
    const tryOnGarments: TryOnGarment[] = await Promise.all(
      used.map(async (g) => ({ ...toGarment(g), tryOnImage: g.tryOnImageKey ? await storedAsDataUri(ctx, g.tryOnImageKey) : undefined })),
    );
    const request = {
      personImage: { url: personImage },
      garments: tryOnGarments,
      options: { build: profile.build as Build, mockFailure: provider.id === "mock" && !!req.mockFailure },
    };
    const cost = provider.estimateCostCredits(request);
    if (cost !== null) await ctx.db.update(generations).set({ costCredits: String(cost) }).where(eq(generations.id, gen.id));
    job = await provider.submit(request);
  } catch (e) {
    job = { providerJobId: "", status: "failed", error: { code: "provider_unavailable", detail: `submit threw: ${(e as Error).name}` } };
  }

  if (job.status === "failed") return failGeneration(ctx, gen, job.error ?? { code: "provider_failed" }, job.providerJobId || null);
  const [updated] = await ctx.db
    .update(generations)
    .set({ providerJobId: job.providerJobId, status: job.status === "completed" ? "processing" : job.status })
    .where(eq(generations.id, gen.id))
    .returning();
  log("info", "generation.submitted", { generation_id: gen.id, provider: provider.id, model: provider.model, job: job.providerJobId.slice(0, 64) });
  return updated;
}

async function findInflight(ctx: ServiceContext, userId: string, requestKey: string) {
  const [row] = await ctx.db
    .select()
    .from(generations)
    .where(and(eq(generations.userId, userId), eq(generations.requestKey, requestKey), inArray(generations.status, [...INFLIGHT])))
    .limit(1);
  return row ?? null;
}

async function personImageFor(ctx: ServiceContext, profile: ProfileRow): Promise<string> {
  if (!profile.modelImageKey) return DEMO_IMAGE_PATH; // demo model: mock provider only
  return storedAsDataUri(ctx, profile.modelImageKey);
}

/** Inputs are sent to providers as base64 data URIs, so no private URL ever leaves the server. */
async function storedAsDataUri(ctx: ServiceContext, key: string): Promise<string> {
  const obj = await ctx.storage.get(key);
  if (!obj) throw new Error("stored image missing");
  return toDataUri(obj.bytes, obj.contentType);
}

async function failGeneration(ctx: ServiceContext, gen: GenerationRow, error: TryOnError, providerJobId: string | null) {
  const [row] = await ctx.db
    .update(generations)
    .set({
      status: "failed",
      errorCode: error.code,
      errorDetail: error.detail?.slice(0, 500) ?? null,
      providerJobId: providerJobId ?? gen.providerJobId,
      durationMs: ctx.now().getTime() - gen.createdAt.getTime(),
      completedAt: ctx.now(),
    })
    .where(and(eq(generations.id, gen.id), inArray(generations.status, [...INFLIGHT])))
    .returning();
  log("warn", "generation.failed", { generation_id: gen.id, code: error.code });
  return row ?? (await loadGeneration(ctx, gen.id))!;
}

async function loadGeneration(ctx: ServiceContext, id: string) {
  const [row] = await ctx.db.select().from(generations).where(eq(generations.id, id)).limit(1);
  return row ?? null;
}

export async function getOwnedGeneration(ctx: ServiceContext, userId: string, id: string): Promise<GenerationRow> {
  const [row] = await ctx.db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("not_found", 404, "That look couldn't be found.");
  return row;
}

/**
 * Advances an in-flight generation by at most one provider status check.
 * Safe to call repeatedly: checks are throttled per generation in the database,
 * so fast or duplicate client polling cannot hammer the provider.
 */
export async function refreshGeneration(ctx: ServiceContext, userId: string, id: string): Promise<GenerationRow> {
  const gen = await getOwnedGeneration(ctx, userId, id);
  if (!INFLIGHT.includes(gen.status as (typeof INFLIGHT)[number])) return gen;

  const now = ctx.now();
  if (now.getTime() - gen.createdAt.getTime() > ctx.limits.generationTimeoutSeconds * 1000) {
    return failGeneration(ctx, gen, { code: "timeout", detail: "no result before timeout" }, null);
  }
  if (!gen.providerJobId) return gen;
  const provider = ctx.provider;
  if (!provider || provider.id !== gen.provider) return gen;

  // Claim this poll slot atomically.
  const claimed = await ctx.db
    .update(generations)
    .set({ lastPolledAt: now })
    .where(
      and(
        eq(generations.id, gen.id),
        inArray(generations.status, [...INFLIGHT]),
        or(isNull(generations.lastPolledAt), lt(generations.lastPolledAt, new Date(now.getTime() - PROVIDER_POLL_MIN_INTERVAL_MS))),
      ),
    )
    .returning();
  if (!claimed[0]) return gen;

  let job: TryOnJob;
  try {
    job = await provider.getStatus(gen.providerJobId);
  } catch (e) {
    log("warn", "generation.status_error", { generation_id: gen.id, name: (e as Error).name });
    return claimed[0];
  }

  if (job.status === "failed") return failGeneration(ctx, gen, job.error ?? { code: "provider_failed" }, null);
  if (job.status !== "completed") {
    if (job.status !== gen.status) {
      const [row] = await ctx.db.update(generations).set({ status: job.status }).where(and(eq(generations.id, gen.id), inArray(generations.status, [...INFLIGHT]))).returning();
      return row ?? gen;
    }
    return claimed[0];
  }

  // Completed: copy the output into our private storage before the provider's copy expires.
  try {
    const bytes = await fetchOutput(ctx, job.outputUrl!);
    const { contentType, ext } = await inspectOutput(bytes);
    const key = storageKeys.generationOutput(userId, gen.id, ext);
    await ctx.storage.put(key, bytes, contentType);
    const done = ctx.now();
    const [row] = await ctx.db
      .update(generations)
      .set({ status: "completed", outputKey: key, durationMs: done.getTime() - gen.createdAt.getTime(), completedAt: done })
      .where(and(eq(generations.id, gen.id), inArray(generations.status, [...INFLIGHT])))
      .returning();
    log("info", "generation.completed", { generation_id: gen.id, provider: gen.provider, duration_ms: row?.durationMs ?? null });
    return row ?? (await loadGeneration(ctx, gen.id))!;
  } catch (e) {
    return failGeneration(ctx, gen, { code: "provider_failed", detail: `output handling: ${(e as Error).message}` }, null);
  }
}

async function fetchOutput(ctx: ServiceContext, url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const header = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    return header.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  }
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_OUTPUT_HOSTS.has(u.hostname)) throw new Error("output host not allowed");
  const res = await (ctx.fetchImpl ?? fetch)(u, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`output download HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_OUTPUT_BYTES) throw new Error("output too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_OUTPUT_BYTES) throw new Error("output too large");
  return buf;
}

/** Recent completed results for the profile, newest first, one per look. */
export async function recentResults(ctx: ServiceContext, userId: string, profileId: string, limit = 12) {
  const rows = await ctx.db
    .select()
    .from(generations)
    .where(and(eq(generations.userId, userId), eq(generations.profileId, profileId), eq(generations.status, "completed")))
    .orderBy(desc(generations.createdAt))
    .limit(limit * 3);
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.lookKey) && seen.add(r.lookKey)).slice(0, limit);
}
