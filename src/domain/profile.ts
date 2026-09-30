import { z } from "zod";

export const BUILDS = ["slim", "average", "athletic", "broad"] as const;
export type Build = (typeof BUILDS)[number];

export const BUILD_LABELS: Record<Build, string> = {
  slim: "Slim",
  average: "Average",
  athletic: "Athletic",
  broad: "Broad",
};

/**
 * Basic body information. It only nudges the visual rendering;
 * it is never used to predict physical fit or size.
 */
export const profileDetailsSchema = z.object({
  heightCm: z.number().int().min(130, "Enter a height between 130 and 230 cm").max(230, "Enter a height between 130 and 230 cm"),
  weightKg: z.number().int().min(35, "Enter a weight between 35 and 250 kg").max(250, "Enter a weight between 35 and 250 kg"),
  build: z.enum(BUILDS),
});
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;

export interface Profile extends ProfileDetails {
  id: string;
  /** Photo the user uploaded (or the demo model image). */
  sourceImageUrl: string;
  /** Prepared model image the try-on runs against. Same as source until a prep step exists. */
  modelImageUrl: string;
  isDemo: boolean;
  createdAt: string;
}

export const DEFAULT_DETAILS: ProfileDetails = { heightCm: 180, weightKg: 75, build: "average" };
