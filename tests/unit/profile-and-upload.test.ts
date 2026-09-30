import { describe, expect, it } from "vitest";
import { profileDetailsSchema } from "@/domain/profile";
import { checkPhotoFile, MAX_UPLOAD_BYTES } from "@/lib/client/image";

describe("profile details", () => {
  it("accepts the brief's example", () => {
    expect(profileDetailsSchema.safeParse({ heightCm: 183, weightKg: 72, build: "slim" }).success).toBe(true);
  });
  it("rejects out-of-range and unknown values", () => {
    expect(profileDetailsSchema.safeParse({ heightCm: 50, weightKg: 72, build: "slim" }).success).toBe(false);
    expect(profileDetailsSchema.safeParse({ heightCm: 183, weightKg: 900, build: "slim" }).success).toBe(false);
    expect(profileDetailsSchema.safeParse({ heightCm: 183, weightKg: 72, build: "huge" }).success).toBe(false);
  });
});

describe("photo upload validation", () => {
  it("accepts common photo types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(checkPhotoFile({ type, size: 1000 }).ok).toBe(true);
  });
  it("rejects other types, empty and oversized files", () => {
    expect(checkPhotoFile({ type: "image/svg+xml", size: 1000 }).ok).toBe(false);
    expect(checkPhotoFile({ type: "application/pdf", size: 1000 }).ok).toBe(false);
    expect(checkPhotoFile({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(checkPhotoFile({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });
});
