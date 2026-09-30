import type { Garment, GarmentCategory } from "@/domain/garment";
import type { Build } from "@/domain/profile";

export type GenerationStatus = "queued" | "processing" | "completed" | "failed";

export type TryOnErrorCode =
  | "bad_input" // e.g. unusable person photo, moderation rejection
  | "provider_failed" // job ran but produced nothing usable
  | "provider_unavailable" // provider down, misconfigured, rate limited or out of credits
  | "timeout";

export interface TryOnError {
  code: TryOnErrorCode;
  /** Internal detail for logs/DB. Never shown to users. */
  detail?: string;
}

/** A garment plus its provider-grade image (URL or data URI), when one exists. */
export type TryOnGarment = Garment & { tryOnImage?: string };

export interface TryOnRequest {
  /** URL or data URI of the person photo. */
  personImage: { url: string };
  /** Garments to apply, already limited to what the provider supports. */
  garments: TryOnGarment[];
  options?: {
    build?: Build;
    /** Deterministic seed where the provider supports one. */
    seed?: number;
    /** Mock provider only: force this job to fail (error-state testing). */
    mockFailure?: boolean;
  };
}

export interface TryOnJob {
  providerJobId: string;
  status: GenerationStatus;
  /** URL or data URI. */
  outputUrl?: string;
  error?: TryOnError;
}

export interface ProviderCapabilities {
  /** Categories this provider applies. Others in a look are NOT rendered. */
  categories: GarmentCategory[];
  /** Max garments applied in one call. */
  maxGarmentsPerCall: number;
  /** True when submit() returns before the image is ready and getStatus() must be polled. */
  async: boolean;
  /** True when each garment needs a provider-grade photo (garment.tryOnImage). */
  requiresGarmentImage: boolean;
  /** True when the output is a real photographic try-on (false for the mock). */
  realTryOn: boolean;
}

/**
 * Boundary every try-on backend implements (mock, FASHN, Google, in-house...).
 * Product code talks to this interface only.
 */
export interface VirtualTryOnProvider {
  readonly id: string;
  /** Model/version identifier, recorded on every generation. */
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  /** Settings that change the output; part of the generation cache identity. */
  readonly optionsFingerprint: string;
  submit(request: TryOnRequest): Promise<TryOnJob>;
  getStatus(providerJobId: string): Promise<TryOnJob>;
  /** Credits for one job when deterministically known from documented pricing, else null. */
  estimateCostCredits(request: TryOnRequest): number | null;
}
