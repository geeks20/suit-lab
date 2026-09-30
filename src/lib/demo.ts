import type { Profile } from "@/domain/profile";

/** DEMO MODE sample model. Illustrated, not a real person. */
export const DEMO_PROFILE: Profile = {
  id: "demo-model",
  heightCm: 183,
  weightKg: 72,
  build: "slim",
  sourceImageUrl: "/demo-assets/model.svg",
  modelImageUrl: "/demo-assets/model.svg",
  isDemo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};
