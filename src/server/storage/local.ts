import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, type ObjectStorage, type StoredObject } from "./types";

/**
 * Local-disk storage for development and tests. Files live outside /public and
 * are only reachable through /api/files with an HMAC-signed, expiring URL.
 */
export class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;
  constructor(
    private root: string,
    private secret: string,
    private now: () => number = Date.now,
  ) {}

  private file(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, bytes: Buffer, contentType: string) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, bytes);
    await writeFile(`${f}.meta.json`, JSON.stringify({ contentType }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const f = this.file(key);
    try {
      const [bytes, meta] = await Promise.all([readFile(f), readFile(`${f}.meta.json`, "utf8")]);
      return { bytes, contentType: JSON.parse(meta).contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const f = this.file(key);
    await rm(f, { force: true });
    await rm(`${f}.meta.json`, { force: true });
  }

  async deletePrefix(prefix: string) {
    if (!prefix.endsWith("/") || prefix.length < 8) throw new Error("Refusing to delete an unsafe prefix");
    const dir = this.file(prefix.slice(0, -1));
    const count = await countFiles(dir);
    await rm(dir, { recursive: true, force: true });
    return count;
  }

  sign(key: string, exp: number) {
    return createHmac("sha256", this.secret).update(`${key}\n${exp}`).digest("base64url");
  }

  verify(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < this.now()) return false;
    const a = Buffer.from(this.sign(key, exp));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async signedUrl(key: string, ttlSeconds: number) {
    assertSafeKey(key);
    const exp = Math.floor(this.now() / 1000) + ttlSeconds;
    return `/api/files/${key}?exp=${exp}&sig=${this.sign(key, exp)}`;
  }
}

async function countFiles(dir: string): Promise<number> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return 0;
  } catch {
    return 0;
  }
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile() && !e.name.endsWith(".meta.json")).length;
}
