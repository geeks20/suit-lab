import "server-only";
import { z } from "zod";

/** Treat empty strings as unset, so `FOO=` in an env file means "not configured". */
const opt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? Number.parseInt(v, 10) : def))
    .pipe(z.number().int().nonnegative());

const schema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  DATABASE_URL: opt,
  /** Local-only fallback directory for the embedded database and local storage. */
  DATA_DIR: opt,
  SESSION_SECRET: opt,

  STORAGE_PROVIDER: z.enum(["local", "r2"]).optional(),
  STORAGE_BUCKET: opt,
  STORAGE_ENDPOINT: opt,
  STORAGE_ACCESS_KEY: opt,
  STORAGE_SECRET_KEY: opt,
  SIGNED_URL_TTL_SECONDS: int(3600),

  VIRTUAL_TRYON_PROVIDER: z.enum(["mock", "fashn"]).optional().default("mock"),
  FASHN_API_KEY: opt,
  FASHN_MODEL: z.enum(["tryon-v1.6", "tryon-max"]).optional().default("tryon-v1.6"),
  /** tryon-v1.6: performance | balanced | quality. tryon-max: fast | balanced | quality. */
  FASHN_MODE: opt,
  /** tryon-max only: 1k | 2k | 4k. */
  FASHN_RESOLUTION: z.enum(["1k", "2k", "4k"]).optional().default("1k"),
  /** Keep provider-side output retention short (60 min per FASHN docs). */
  FASHN_RETURN_BASE64: z
    .string()
    .optional()
    .transform((v) => v !== "false"),

  GENERATION_USER_HOURLY_LIMIT: int(20),
  GENERATION_GLOBAL_DAILY_LIMIT: int(200),
  GENERATION_MAX_IN_FLIGHT: int(4),
  GENERATION_TIMEOUT_SECONDS: int(240),
  PROFILE_USER_HOURLY_LIMIT: int(10),
});

export type AppConfig = z.infer<typeof schema> & { isProduction: boolean; dataDir: string; storageProvider: "local" | "r2" };

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  const isProduction = parsed.NODE_ENV === "production" && process.env.SUITLAB_ALLOW_LOCAL !== "1";
  const storageProvider = parsed.STORAGE_PROVIDER ?? (parsed.STORAGE_BUCKET ? "r2" : "local");
  if (isProduction) {
    if (!parsed.SESSION_SECRET || parsed.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET (32+ chars) is required in production");
    if (!parsed.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
    if (storageProvider !== "r2") throw new Error("STORAGE_PROVIDER=r2 is required in production");
  }
  cached = { ...parsed, isProduction, dataDir: parsed.DATA_DIR ?? ".data", storageProvider };
  return cached;
}

/** Dev/test only: a fixed secret so sessions survive restarts. Production requires SESSION_SECRET. */
export function sessionSecret(): string {
  return getConfig().SESSION_SECRET ?? "suitlab-dev-only-secret-do-not-use-in-production";
}

export function resetConfigForTests() {
  cached = null;
}
