import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Phase 2A schema. Images are never stored here — only object-storage keys.
 * Ownership: every user-owned row carries user_id and every query filters on it.
 */

/** Anonymous session users. Real accounts can attach to these rows later. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    heightCm: smallint("height_cm").notNull(),
    weightKg: smallint("weight_kg").notNull(),
    build: text("build").notNull(),
    /** Private storage key of the normalised upload. Null for the demo model. */
    sourceImageKey: text("source_image_key"),
    /** Image the provider runs against. Same as source until a prep step exists. */
    modelImageKey: text("model_image_key"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_user_created_idx").on(t.userId, t.createdAt),
    check("profiles_build_chk", sql`${t.build} in ('slim','average','athletic','broad')`),
  ],
);

export const garments = pgTable(
  "garments",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    style: text("style").notNull(),
    material: text("material").notNull(),
    formality: smallint("formality").notNull(),
    imageUrl: text("image_url").notNull(),
    /** Private storage key of the provider-grade garment photo. Null = not try-on ready. */
    tryOnImageKey: text("try_on_image_key"),
    metadata: jsonb("metadata").notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("garments_category_idx").on(t.category),
    check("garments_category_chk", sql`${t.category} in ('suit','shirt','tie','shoes')`),
  ],
);

export const GENERATION_STATUSES = ["queued", "processing", "completed", "failed"] as const;

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    lookId: uuid("look_id"),
    provider: text("provider").notNull(),
    providerModel: text("provider_model"),
    providerJobId: text("provider_job_id"),
    status: text("status").notNull(),
    /** sha256 of the generation identity (profile image, garments + asset versions, provider, model, options). */
    requestKey: text("request_key").notNull(),
    /** Human-readable key of the garments actually applied, e.g. "suit-midnight-navy". */
    lookKey: text("look_key").notNull(),
    /** Garment ids + options. Never image contents or URLs. */
    inputData: jsonb("input_data").notNull(),
    outputKey: text("output_key"),
    errorCode: text("error_code"),
    /** Internal provider detail. Never returned to clients. */
    errorDetail: text("error_detail"),
    cacheHit: boolean("cache_hit").notNull().default(false),
    cachedFromId: uuid("cached_from_id"),
    durationMs: integer("duration_ms"),
    /** Provider credits, only when deterministically known from documented pricing. */
    costCredits: numeric("cost_credits", { precision: 10, scale: 2 }),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("generations_user_created_idx").on(t.userId, t.createdAt),
    index("generations_cache_idx").on(t.userId, t.requestKey, t.status),
    index("generations_status_created_idx").on(t.status, t.createdAt),
    // At most one in-flight job per identical request per user: blocks duplicate paid jobs under races.
    uniqueIndex("generations_inflight_uniq")
      .on(t.userId, t.requestKey)
      .where(sql`status in ('queued','processing')`),
    check("generations_status_chk", sql`${t.status} in ('queued','processing','completed','failed')`),
  ],
);

export const looks = pgTable(
  "looks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Null means the category was not applied by the generation (e.g. one-garment try-on). */
    suitId: text("suit_id").references(() => garments.id),
    shirtId: text("shirt_id").references(() => garments.id),
    tieId: text("tie_id").references(() => garments.id),
    shoesId: text("shoes_id").references(() => garments.id),
    generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
    generatedImageKey: text("generated_image_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("looks_user_created_idx").on(t.userId, t.createdAt),
    uniqueIndex("looks_user_generation_uniq").on(t.userId, t.generationId),
  ],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type GarmentRow = typeof garments.$inferSelect;
export type GenerationRow = typeof generations.$inferSelect;
export type LookRow = typeof looks.$inferSelect;
