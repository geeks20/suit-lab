export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

/**
 * Private object storage. Keys are never public; clients only ever receive
 * short-lived signed URLs from signedUrl().
 */
export interface ObjectStorage {
  readonly kind: "r2" | "local" | "memory";
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object under a prefix. Returns the number deleted. */
  deletePrefix(prefix: string): Promise<number>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]*$/i;

/** Rejects traversal and odd characters. Keys are always generated server-side. */
export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//") || key.endsWith("/")) {
    throw new Error("Invalid storage key");
  }
}

export const storageKeys = {
  userPrefix: (userId: string) => `users/${userId}/`,
  profileSource: (userId: string, profileId: string) => `users/${userId}/profiles/${profileId}/source.jpg`,
  generationOutput: (userId: string, generationId: string, ext: string) => `users/${userId}/generations/${generationId}.${ext}`,
  garmentTryOn: (garmentId: string, version: string, ext: string) => `garments/${garmentId}/tryon-${version}.${ext}`,
};
