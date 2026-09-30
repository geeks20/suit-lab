import "server-only";
import path from "node:path";
import { getConfig, sessionSecret } from "../config";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";
import type { ObjectStorage } from "./types";

export { storageKeys, type ObjectStorage } from "./types";

const g = globalThis as unknown as { __suitlabStorage?: ObjectStorage };

export function getStorage(): ObjectStorage {
  if (g.__suitlabStorage) return g.__suitlabStorage;
  const cfg = getConfig();
  if (cfg.storageProvider === "r2") {
    const { STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY } = cfg;
    if (!STORAGE_ENDPOINT || !STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      throw new Error("R2 storage requires STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY");
    }
    g.__suitlabStorage = new R2Storage({
      endpoint: STORAGE_ENDPOINT,
      bucket: STORAGE_BUCKET,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
    });
  } else {
    g.__suitlabStorage = new LocalStorage(path.resolve(cfg.dataDir, "storage"), sessionSecret());
  }
  return g.__suitlabStorage;
}

export function setStorageForTests(s: ObjectStorage | null) {
  g.__suitlabStorage = s ?? undefined;
}
