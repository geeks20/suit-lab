import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getConfig } from "../config";
import * as schema from "./schema";
import { seedGarments } from "./seed";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __suitlabDb?: Promise<DB> };

/**
 * DATABASE_URL set  → Postgres (Neon) via node-postgres. Migrations run with `npm run db:migrate`.
 * DATABASE_URL unset → embedded PGlite in DATA_DIR (local dev / e2e only), migrated automatically.
 */
export function getDb(): Promise<DB> {
  g.__suitlabDb ??= open();
  return g.__suitlabDb;
}

async function open(): Promise<DB> {
  const cfg = getConfig();
  if (cfg.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: cfg.DATABASE_URL, max: 5 });
    return drizzle(pool, { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.resolve(cfg.dataDir, "pglite");
  await mkdir(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  await seedGarments(db as unknown as DB);
  return db as unknown as DB;
}

export function setDbForTests(db: DB | null) {
  g.__suitlabDb = db ? Promise.resolve(db) : undefined;
}
