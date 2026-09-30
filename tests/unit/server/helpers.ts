import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import * as schema from "@/server/db/schema";
import type { DB } from "@/server/db/client";
import { seedGarments } from "@/server/db/seed";
import { MemoryStorage } from "@/server/storage/memory";
import { DEFAULT_LIMITS, type ServiceContext } from "@/server/services/context";
import type { TryOnJob, TryOnRequest, VirtualTryOnProvider } from "@/lib/tryon";

export async function makeDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  await seedGarments(db as unknown as DB);
  return db as unknown as DB;
}

export class Clock {
  constructor(public t = Date.parse("2026-10-01T10:00:00Z")) {}
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t += ms;
  }
}

export async function makeCtx(over: Partial<ServiceContext> = {}) {
  const clock = new Clock();
  const ctx: ServiceContext = {
    db: await makeDb(),
    storage: new MemoryStorage(),
    provider: null,
    now: clock.now,
    limits: { ...DEFAULT_LIMITS },
    ...over,
  };
  return { ctx, clock, storage: ctx.storage as MemoryStorage };
}

export async function makeUser(ctx: ServiceContext): Promise<string> {
  const [u] = await ctx.db.insert(schema.users).values({}).returning();
  return u.id;
}

/** A real JPEG "photo". */
export async function photo(width = 600, height = 800, format: "jpeg" | "png" | "webp" = "jpeg"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 180, g: 150, b: 130 } } })
    [format]()
    .toBuffer();
}

export async function markGarmentReady(ctx: ServiceContext, garmentId = "suit-midnight-navy") {
  const key = `garments/${garmentId}/tryon-abc123.jpg`;
  await ctx.storage.put(key, await photo(800, 1000), "image/jpeg");
  await ctx.db.update(schema.garments).set({ tryOnImageKey: key }).where(eq(schema.garments.id, garmentId));
  return key;
}

/** Scriptable provider double that records every call. */
export class FakeProvider implements VirtualTryOnProvider {
  id = "fake";
  model = "fake-v1";
  optionsFingerprint = "opts";
  capabilities = { categories: ["suit" as const], maxGarmentsPerCall: 1, async: true, requiresGarmentImage: true, realTryOn: true };
  submits: TryOnRequest[] = [];
  statusCalls = 0;
  submitResult: TryOnJob | (() => TryOnJob) = { providerJobId: "job-1", status: "queued" };
  statusQueue: TryOnJob[] = [];
  submitDelayMs = 0;

  async submit(req: TryOnRequest) {
    this.submits.push(req);
    if (this.submitDelayMs) await new Promise((r) => setTimeout(r, this.submitDelayMs));
    return typeof this.submitResult === "function" ? this.submitResult() : this.submitResult;
  }
  async getStatus(id: string): Promise<TryOnJob> {
    this.statusCalls++;
    return this.statusQueue.shift() ?? { providerJobId: id, status: "processing" };
  }
  estimateCostCredits() {
    return 1;
  }
}

export const PNG_OUTPUT = async () => `data:image/png;base64,${(await photo(864, 1296, "png")).toString("base64")}`;
