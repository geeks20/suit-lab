import type { Garment, GarmentCategory } from "./garment";
import { GARMENT_CATEGORIES } from "./garment";
import { getGarment, garmentsInCategory } from "./wardrobe";

/** The outfit currently assembled in the studio: one garment id per category. */
export type LookSelection = Record<GarmentCategory, string>;
export type ResolvedLook = Record<GarmentCategory, Garment>;

export const DEFAULT_LOOK: LookSelection = {
  suit: "suit-midnight-navy",
  shirt: "shirt-crisp-white",
  tie: "tie-burgundy",
  shoes: "shoes-black-oxford",
};

/** Returns a new selection with one category changed; other selections are kept. */
export function withGarment(look: LookSelection, garment: Garment): LookSelection {
  if (look[garment.category] === garment.id) return look;
  return { ...look, [garment.category]: garment.id };
}

/** True when every id exists, is active and sits in the category it claims. */
export function isValidLook(value: unknown): value is LookSelection {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return GARMENT_CATEGORIES.every((cat) => {
    const id = rec[cat];
    if (typeof id !== "string") return false;
    const g = getGarment(id);
    return !!g && g.active && g.category === cat;
  });
}

/** Repairs a partially invalid selection (e.g. a garment was retired) using defaults. */
export function sanitizeLook(value: unknown): LookSelection {
  const rec = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOOK };
  for (const cat of GARMENT_CATEGORIES) {
    const id = rec[cat];
    const g = typeof id === "string" ? getGarment(id) : undefined;
    if (g && g.active && g.category === cat) out[cat] = g.id;
    else if (!getGarment(out[cat])?.active) out[cat] = garmentsInCategory(cat)[0]?.id ?? out[cat];
  }
  return out;
}

export function resolveLook(look: LookSelection): ResolvedLook {
  const out = {} as ResolvedLook;
  for (const cat of GARMENT_CATEGORIES) {
    const g = getGarment(look[cat]);
    if (!g) throw new Error(`Unknown garment for ${cat}`);
    out[cat] = g;
  }
  return out;
}

/** Stable key for a garment combination; used for caching and duplicate detection. */
export function lookKey(look: LookSelection): string {
  return GARMENT_CATEGORIES.map((cat) => look[cat]).join("|");
}

export function sameLook(a: LookSelection | null | undefined, b: LookSelection | null | undefined): boolean {
  return !!a && !!b && lookKey(a) === lookKey(b);
}
