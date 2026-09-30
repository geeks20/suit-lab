/**
 * Registers the provider-grade photo for ONE garment (Phase 2A: one real garment).
 * Validates and normalises the image, uploads it to private storage, and sets
 * garments.try_on_image_key. The key includes a content hash, so replacing the
 * photo automatically invalidates cached generations.
 *
 * Usage: npm run garment:set -- <garment-id> <path/to/photo.jpg>
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });
config();

const [garmentId, file] = process.argv.slice(2);
if (!garmentId || !file) {
  console.error("Usage: npm run garment:set -- <garment-id> <path/to/photo.jpg>");
  process.exit(1);
}

const { getDb } = await import("../src/server/db/client");
const { garments } = await import("../src/server/db/schema");
const { getStorage, storageKeys } = await import("../src/server/storage");

const db = await getDb();
const [row] = await db.select().from(garments).where(eq(garments.id, garmentId));
if (!row) {
  console.error(`Unknown garment id: ${garmentId}`);
  process.exit(1);
}

const input = await readFile(file);
const meta = await sharp(input).metadata();
if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new Error(`Unsupported format: ${meta.format}`);
if (Math.min(meta.width ?? 0, meta.height ?? 0) < 512) throw new Error(`Garment photo too small (${meta.width}x${meta.height}); use at least 512px on the short side.`);

const bytes = await sharp(input).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
const version = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const key = storageKeys.garmentTryOn(garmentId, version, "jpg");
const storage = getStorage();
await storage.put(key, bytes, "image/jpeg");
if (row.tryOnImageKey && row.tryOnImageKey !== key) await storage.delete(row.tryOnImageKey).catch(() => {});
await db.update(garments).set({ tryOnImageKey: key }).where(eq(garments.id, garmentId));

console.log(`✓ ${row.name} (${garmentId}) is try-on ready.`);
console.log(`  storage: ${storage.kind}  key: ${key}  size: ${(bytes.length / 1024).toFixed(0)} KB`);
process.exit(0);
