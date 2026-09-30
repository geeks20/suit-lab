import { sql } from "drizzle-orm";
import { WARDROBE } from "@/domain/wardrobe";
import type { DB } from "./client";
import { garments } from "./schema";

/** Upserts the curated wardrobe. Never touches try_on_image_key (set by scripts/set-garment-asset). */
export async function seedGarments(db: DB) {
  await db
    .insert(garments)
    .values(
      WARDROBE.map((g) => ({
        id: g.id,
        category: g.category,
        name: g.name,
        color: g.color,
        style: g.style,
        material: g.material,
        formality: g.formality,
        imageUrl: g.imageUrl,
        metadata: g.metadata,
        active: g.active,
      })),
    )
    .onConflictDoUpdate({
      target: garments.id,
      set: {
        category: sql`excluded.category`,
        name: sql`excluded.name`,
        color: sql`excluded.color`,
        style: sql`excluded.style`,
        material: sql`excluded.material`,
        formality: sql`excluded.formality`,
        imageUrl: sql`excluded.image_url`,
        metadata: sql`excluded.metadata`,
        active: sql`excluded.active`,
      },
    });
}
