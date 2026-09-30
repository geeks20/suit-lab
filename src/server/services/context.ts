import type { VirtualTryOnProvider } from "@/lib/tryon";
import type { DB } from "../db/client";
import type { ObjectStorage } from "../storage/types";

export interface Limits {
  generationUserHourly: number;
  generationGlobalDaily: number;
  generationMaxInFlight: number;
  generationTimeoutSeconds: number;
  profileUserHourly: number;
  signedUrlTtlSeconds: number;
}

export interface ServiceContext {
  db: DB;
  storage: ObjectStorage;
  /** Null when the configured provider is misconfigured (e.g. fashn without a key). */
  provider: VirtualTryOnProvider | null;
  now: () => Date;
  limits: Limits;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_LIMITS: Limits = {
  generationUserHourly: 20,
  generationGlobalDaily: 200,
  generationMaxInFlight: 4,
  generationTimeoutSeconds: 240,
  profileUserHourly: 10,
  signedUrlTtlSeconds: 3600,
};

export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    /** User-facing message. */
    public userMessage: string,
    /** Internal detail for logs. */
    public detail?: string,
  ) {
    super(detail ?? userMessage);
  }
}
