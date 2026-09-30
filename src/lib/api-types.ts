import type { GarmentCategory } from "@/domain/garment";
import type { Build } from "@/domain/profile";
import type { GenerationStatus } from "@/lib/tryon/types";

/** JSON shapes exchanged between the browser and /api. Image URLs are short-lived signed URLs. */

export interface ProfileDTO {
  id: string;
  heightCm: number;
  weightKg: number;
  build: Build;
  isDemo: boolean;
  sourceImageUrl: string;
  createdAt: string;
}

export type AppliedSelection = Partial<Record<GarmentCategory, string>>;

export interface GenerationDTO {
  id: string;
  status: GenerationStatus;
  /** Garments the provider actually applied. */
  applied: AppliedSelection;
  /** Key of the applied garments; the studio compares against this. */
  lookKey: string;
  imageUrl: string | null;
  /** Friendly message only. */
  errorMessage: string | null;
  cacheHit: boolean;
  createdAt: string;
}

export interface LookDTO {
  id: string;
  profileId: string;
  name: string;
  selection: AppliedSelection;
  imageUrl: string;
  generationId: string | null;
  createdAt: string;
}

export interface CapabilitiesDTO {
  provider: string;
  realTryOn: boolean;
  /** Categories the current provider applies. */
  categories: GarmentCategory[];
  /** Garments usable with the provider (all, for the mock). */
  readyGarmentIds: string[];
  demoSupported: boolean;
}

export interface SessionDTO {
  profile: ProfileDTO | null;
  generations: GenerationDTO[];
  looks: LookDTO[];
  capabilities: CapabilitiesDTO;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
