import type { TryOnErrorCode } from "@/lib/tryon/types";

/** The only generation error texts users ever see. */
export const GENERATION_MESSAGES: Record<TryOnErrorCode, string> = {
  bad_input: "We couldn't use this photo. Try a clearer image with your face visible.",
  provider_failed: "That look didn't generate properly.",
  provider_unavailable: "Suit Lab is having trouble creating this look right now.",
  timeout: "Suit Lab is having trouble creating this look right now.",
};
