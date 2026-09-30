import { renderFigureSvg } from "@/lib/art/figure";
import { resolveLook, DEFAULT_LOOK } from "@/domain/look";

/** DEMO MODE assets: a sample model and a sample finished look. Not user data. */
const ASSETS: Record<string, () => string> = {
  "model.svg": () => renderFigureSvg(),
  "look.svg": () => renderFigureSvg({ look: resolveLook(DEFAULT_LOOK) }),
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ASSETS).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: RouteContext<"/demo-assets/[file]">) {
  const { file } = await ctx.params;
  const render = ASSETS[file];
  if (!render) return new Response("Not found", { status: 404 });
  return new Response(render(), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
  });
}
