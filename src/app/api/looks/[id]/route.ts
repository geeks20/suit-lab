import { getContext, handle, json, readJson } from "@/server/http";
import { AppError } from "@/server/services/context";
import { deleteLook, lookDTO, renameLook } from "@/server/services/looks";
import { getSessionUser } from "@/server/session";

async function owner(req: Request, id: string) {
  const ctx = await getContext();
  const userId = await getSessionUser(ctx.db, req);
  if (!userId || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("not_found", 404, "That look couldn't be found.");
  return { ctx, userId };
}

export async function PATCH(req: Request, arg: RouteContext<"/api/looks/[id]">) {
  return handle(req, async () => {
    const { id } = await arg.params;
    const { ctx, userId } = await owner(req, id);
    const body = await readJson(req);
    return json({ look: await lookDTO(ctx, await renameLook(ctx, userId, id, body.name)) });
  });
}

export async function DELETE(req: Request, arg: RouteContext<"/api/looks/[id]">) {
  return handle(req, async () => {
    const { id } = await arg.params;
    const { ctx, userId } = await owner(req, id);
    await deleteLook(ctx, userId, id);
    return json({ ok: true });
  });
}
