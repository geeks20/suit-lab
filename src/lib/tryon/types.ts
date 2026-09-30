import type { Garment, GarmentCategory } from "@/domain/garment";
import type { Build } from "@/domain/profile";

export type GenerationStatus = "queued" | "processing" | "completed" | "failed";

export type TryOnErrorCode =
  | "bad_input" // e.g. unusable person photo
  | "provider_failed" // job ran but produced nothing usable
  | "provider_unavailable" // provider down / rate limited upstream
  | "timeout";

export interface TryOnError {
  code: TryOnErrorCode;
  /** Internal detail for logs. Never shown to users. */
  detail?: string;
}

export interface TryOnRequest {
  personImage: { url: string };
  /** Garments to apply. Empty garments (e.g. "No Tie") are passed so providers can remove items. */
  garments: Garment[];
  options?: {
    build?: Build;
    /** Deterministic seed where the provider supports one. */
    seed?: number;
  };
}

export interface TryOnJob {
  providerJobId: string;
  status: GenerationStatus;
  outputUrl?: string;
  error?: TryOnError;
}

export interface ProviderCapabilities {
  /** Categories this provider can render at all. */
  categories: GarmentCategory[];
  /** Max garments applied in one call. The pipeline splits work beyond this. */
  maxGarmentsPerCall: number;
  /** True when submit() returns before the image is ready and getStatus() must be polled. */
  async: boolean;
}

/**
 * Boundary every try-on backend implements (mock, FASHN, Google, in-house...).
 * Product code talks to this interface only.
 */
export interface VirtualTryOnProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  submit(request: TryOnRequest): Promise<TryOnJob>;
  getStatus(providerJobId: string): Promise<TryOnJob>;
}
