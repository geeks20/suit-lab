import { getContext, handle, json, readJson } from "@/server/http";
import { AppError } from "@/server/services/context";
import { lookDTO, saveLook } from "@/server/services/looks";
import { getSessionUser } from "@/server/session";

export async function POST(req: Request) {
  return handle(req, async () => {
    const ctx = await getContext();
    const userId = await getSessionUser(ctx.db, req);
    if (!userId) throw new AppError("no_session", 401, "Create your model first.");
    const body = await readJson(req);
    if (typeof body.generationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.generationId)) throw new AppError("bad_request", 400, "Invalid request.");
    const { look, alreadySaved } = await saveLook(ctx, userId, body.generationId);
    return json({ look: await lookDTO(ctx, look), alreadySaved }, { status: alreadySaved ? 200 : 201 });
  });
}
