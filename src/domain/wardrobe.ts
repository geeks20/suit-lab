import type { Garment, GarmentCategory, GarmentMetadata, Formality } from "./garment";

type Seed = {
  id: string;
  category: GarmentCategory;
  name: string;
  color: string;
  style: string;
  material: string;
  formality: Formality;
  metadata: GarmentMetadata;
};

const thumb = (id: string) => `/wardrobe-art/${id}.svg`;

const SEED: Seed[] = [
  // Suits
  { id: "suit-midnight-navy", category: "suit", name: "Midnight Navy", color: "navy", style: "Single-breasted, notch lapel", material: "Wool twill", formality: 4, metadata: { swatch: "#1d2940", silhouette: "single-breasted" } },
  { id: "suit-charcoal", category: "suit", name: "Charcoal", color: "charcoal", style: "Single-breasted, notch lapel", material: "Wool flannel", formality: 4, metadata: { swatch: "#3a3b3e", silhouette: "single-breasted" } },
  { id: "suit-classic-black", category: "suit", name: "Classic Black", color: "black", style: "Single-breasted, notch lapel", material: "Wool", formality: 5, metadata: { swatch: "#161616", silhouette: "single-breasted" } },
  { id: "suit-warm-cream", category: "suit", name: "Warm Cream", color: "cream", style: "Single-breasted, notch lapel", material: "Linen-wool", formality: 3, metadata: { swatch: "#e2d6bd", silhouette: "single-breasted" } },
  { id: "suit-chocolate-brown", category: "suit", name: "Chocolate Brown", color: "brown", style: "Single-breasted, notch lapel", material: "Wool flannel", formality: 3, metadata: { swatch: "#4a3024", silhouette: "single-breasted" } },
  { id: "suit-light-grey", category: "suit", name: "Light Grey", color: "light grey", style: "Single-breasted, notch lapel", material: "Tropical wool", formality: 3, metadata: { swatch: "#a9aaa8", silhouette: "single-breasted" } },

  // Shirts
  { id: "shirt-crisp-white", category: "shirt", name: "Crisp White", color: "white", style: "Classic collar", material: "Cotton poplin", formality: 5, metadata: { swatch: "#f7f6f2", silhouette: "classic-collar" } },
  { id: "shirt-light-blue", category: "shirt", name: "Light Blue", color: "light blue", style: "Classic collar", material: "Cotton oxford", formality: 4, metadata: { swatch: "#bfd1e5", silhouette: "classic-collar" } },
  { id: "shirt-black", category: "shirt", name: "Black", color: "black", style: "Classic collar", material: "Cotton poplin", formality: 3, metadata: { swatch: "#1b1b1c", silhouette: "classic-collar" } },
  { id: "shirt-ivory", category: "shirt", name: "Ivory", color: "ivory", style: "Classic collar", material: "Cotton twill", formality: 4, metadata: { swatch: "#efe8d6", silhouette: "classic-collar" } },

  // Ties
  { id: "tie-burgundy", category: "tie", name: "Burgundy", color: "burgundy", style: "Standard width", material: "Silk", formality: 4, metadata: { swatch: "#6b1e2a", silhouette: "standard-tie" } },
  { id: "tie-navy", category: "tie", name: "Navy", color: "navy", style: "Standard width", material: "Silk", formality: 4, metadata: { swatch: "#1f2c4a", silhouette: "standard-tie" } },
  { id: "tie-forest-green", category: "tie", name: "Forest Green", color: "forest green", style: "Standard width", material: "Silk", formality: 4, metadata: { swatch: "#24392f", silhouette: "standard-tie" } },
  { id: "tie-black", category: "tie", name: "Black", color: "black", style: "Standard width", material: "Silk", formality: 5, metadata: { swatch: "#121212", silhouette: "standard-tie" } },
  { id: "tie-none", category: "tie", name: "No Tie", color: "none", style: "Open collar", material: "—", formality: 2, metadata: { swatch: "transparent", silhouette: "none", isEmpty: true } },

  // Shoes
  { id: "shoes-black-oxford", category: "shoes", name: "Black Oxford", color: "black", style: "Cap-toe Oxford", material: "Calf leather", formality: 5, metadata: { swatch: "#141414", accent: "#2a2a2a", silhouette: "oxford" } },
  { id: "shoes-dark-brown-oxford", category: "shoes", name: "Dark Brown Oxford", color: "dark brown", style: "Cap-toe Oxford", material: "Calf leather", formality: 4, metadata: { swatch: "#3b2518", accent: "#24160e", silhouette: "oxford" } },
  { id: "shoes-black-loafer", category: "shoes", name: "Black Loafer", color: "black", style: "Penny loafer", material: "Calf leather", formality: 3, metadata: { swatch: "#161616", accent: "#2a2a2a", silhouette: "loafer" } },
];

export const WARDROBE: readonly Garment[] = SEED.map((g) => ({
  ...g,
  imageUrl: thumb(g.id),
  tryOnImageUrl: null,
  active: true,
}));

const BY_ID = new Map(WARDROBE.map((g) => [g.id, g]));

export function getGarment(id: string): Garment | undefined {
  return BY_ID.get(id);
}

export function garmentsInCategory(category: GarmentCategory): Garment[] {
  return WARDROBE.filter((g) => g.category === category && g.active);
}
