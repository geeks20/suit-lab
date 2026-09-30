/**
 * Applies SQL migrations in ./drizzle to DATABASE_URL (prefers DATABASE_URL_UNPOOLED) and seeds the wardrobe.
 * Usage: npm run db:migrate
 */
import { config } from "dotenv";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema";
import { seedGarments } from "../src/server/db/seed";
import type { DB } from "../src/server/db/client";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. (Local dev without it uses an embedded database that migrates itself.)");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });
await migrate(db, { migrationsFolder: path.resolve("drizzle") });
await seedGarments(db as unknown as DB);
const { rows } = await pool.query("select category, count(*)::int as n from garments group by category order by category");
console.log("Migrations applied. Garments:", rows.map((r) => `${r.category}=${r.n}`).join(", "));
await pool.end();
