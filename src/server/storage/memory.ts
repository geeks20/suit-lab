import { assertSafeKey, type ObjectStorage, type StoredObject } from "./types";

/** In-memory storage for tests. */
export class MemoryStorage implements ObjectStorage {
  readonly kind = "memory" as const;
  readonly objects = new Map<string, StoredObject>();

  async put(key: string, bytes: Buffer, contentType: string) {
    assertSafeKey(key);
    this.objects.set(key, { bytes, contentType });
  }
  async get(key: string) {
    assertSafeKey(key);
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async deletePrefix(prefix: string) {
    if (!prefix.endsWith("/") || prefix.length < 8) throw new Error("Refusing to delete an unsafe prefix");
    let n = 0;
    for (const k of [...this.objects.keys()]) {
      if (k.startsWith(prefix)) {
        this.objects.delete(k);
        n++;
      }
    }
    return n;
  }
  async signedUrl(key: string, ttlSeconds: number) {
    return `memory://${key}?ttl=${ttlSeconds}&sig=test`;
  }
}
