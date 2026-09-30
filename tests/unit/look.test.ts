import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, isValidLook, lookKey, resolveLook, sameLook, sanitizeLook, withGarment } from "@/domain/look";
import { getGarment, garmentsInCategory, WARDROBE } from "@/domain/wardrobe";

describe("wardrobe seed", () => {
  it("matches the curated V0 wardrobe", () => {
    expect(garmentsInCategory("suit")).toHaveLength(6);
    expect(garmentsInCategory("shirt")).toHaveLength(4);
    expect(garmentsInCategory("tie")).toHaveLength(5);
    expect(garmentsInCategory("shoes")).toHaveLength(3);
  });

  it("has unique ids and complete garment objects", () => {
    expect(new Set(WARDROBE.map((g) => g.id)).size).toBe(WARDROBE.length);
    for (const g of WARDROBE) {
      expect(g.imageUrl).toMatch(/^\/wardrobe-art\/.+\.svg$/);
      expect(g.metadata.swatch).toBeTruthy();
      expect(g.formality).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("look selection", () => {
  it("changing one category keeps the other selections", () => {
    const next = withGarment(DEFAULT_LOOK, getGarment("tie-forest-green")!);
    expect(next).toEqual({ ...DEFAULT_LOOK, tie: "tie-forest-green" });
    expect(DEFAULT_LOOK.tie).toBe("tie-burgundy");
  });

  it("returns the same object when the garment is already selected", () => {
    expect(withGarment(DEFAULT_LOOK, getGarment(DEFAULT_LOOK.suit)!)).toBe(DEFAULT_LOOK);
  });

  it("rejects invented ids and ids in the wrong category", () => {
    expect(isValidLook(DEFAULT_LOOK)).toBe(true);
    expect(isValidLook({ ...DEFAULT_LOOK, suit: "suit-velvet-purple" })).toBe(false);
    expect(isValidLook({ ...DEFAULT_LOOK, suit: "tie-navy" })).toBe(false);
    expect(isValidLook({ suit: DEFAULT_LOOK.suit })).toBe(false);
    expect(isValidLook(null)).toBe(false);
  });

  it("sanitizes stored selections back to valid garments", () => {
    expect(sanitizeLook({ ...DEFAULT_LOOK, shirt: "nope" })).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ ...DEFAULT_LOOK, tie: "tie-none" }).tie).toBe("tie-none");
    expect(sanitizeLook(undefined)).toEqual(DEFAULT_LOOK);
  });

  it("produces a stable key for caching", () => {
    expect(lookKey(DEFAULT_LOOK)).toBe("suit-midnight-navy|shirt-crisp-white|tie-burgundy|shoes-black-oxford");
    expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK })).toBe(true);
    expect(sameLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, tie: "tie-none" })).toBe(false);
  });

  it("resolves to garment objects", () => {
    expect(resolveLook(DEFAULT_LOOK).suit.name).toBe("Midnight Navy");
  });
});
