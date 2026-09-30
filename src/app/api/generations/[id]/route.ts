import { getContext, handle, json } from "@/server/http";
import { AppError } from "@/server/services/context";
import { generationDTO, refreshGeneration } from "@/server/services/generations";
import { getSessionUser } from "@/server/session";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request, ctxArg: RouteContext<"/api/generations/[id]">) {
  return handle(req, async () => {
    const { id } = await ctxArg.params;
    const ctx = await getContext();
    const userId = await getSessionUser(ctx.db, req);
    if (!userId || !UUID_RE.test(id)) throw new AppError("not_found", 404, "That look couldn't be found.");
    const row = await refreshGeneration(ctx, userId, id);
    return json({ generation: await generationDTO(ctx, row) });
  });
}
