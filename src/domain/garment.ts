export const GARMENT_CATEGORIES = ["suit", "shirt", "tie", "shoes"] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<GarmentCategory, { singular: string; plural: string }> = {
  suit: { singular: "Suit", plural: "Suits" },
  shirt: { singular: "Shirt", plural: "Shirts" },
  tie: { singular: "Tie", plural: "Ties" },
  shoes: { singular: "Shoes", plural: "Shoes" },
};

/** 1 = relaxed, 5 = black tie. Used by the stylist and for sorting, never shown as a promise. */
export type Formality = 1 | 2 | 3 | 4 | 5;

export interface GarmentMetadata {
  /** Primary display colour (hex). Drives illustrations and swatches. */
  swatch: string;
  /** Optional secondary colour, e.g. a sole or a tie pattern. */
  accent?: string;
  /** Silhouette hint for illustration and provider prompts. */
  silhouette?: "single-breasted" | "oxford" | "loafer" | "classic-collar" | "standard-tie" | "none";
  /** Garment represents "nothing worn" in its category (e.g. No Tie). */
  isEmpty?: boolean;
  [key: string]: unknown;
}

export interface Garment {
  id: string;
  category: GarmentCategory;
  name: string;
  color: string;
  style: string;
  material: string;
  formality: Formality;
  /** Thumbnail for the wardrobe UI. */
  imageUrl: string;
  /** Flat-lay/product image sent to a try-on provider. Null until real assets exist. */
  tryOnImageUrl: string | null;
  metadata: GarmentMetadata;
  active: boolean;
}

export function isGarmentCategory(value: unknown): value is GarmentCategory {
  return typeof value === "string" && (GARMENT_CATEGORIES as readonly string[]).includes(value);
}
