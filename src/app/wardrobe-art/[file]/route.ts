import { WARDROBE, getGarment } from "@/domain/wardrobe";
import { renderGarmentThumbSvg } from "@/lib/art/garment-thumb";

export const dynamicParams = false;

export function generateStaticParams() {
  return WARDROBE.map((g) => ({ file: `${g.id}.svg` }));
}

export async function GET(_req: Request, ctx: RouteContext<"/wardrobe-art/[file]">) {
  const { file } = await ctx.params;
  const garment = getGarment(file.replace(/\.svg$/, ""));
  if (!garment) return new Response("Not found", { status: 404 });
  return new Response(renderGarmentThumbSvg(garment), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
