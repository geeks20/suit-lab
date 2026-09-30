import { getContext, handle, json, readJson } from "@/server/http";
import { AppError } from "@/server/services/context";
import { generationDTO, requestGeneration } from "@/server/services/generations";
import { getSessionUser, readCookie } from "@/server/session";

/** Starts (or reuses) a generation and returns immediately. Clients poll GET /api/generations/:id. */
export async function POST(req: Request) {
  return handle(req, async () => {
    const ctx = await getContext();
    const userId = await getSessionUser(ctx.db, req);
    if (!userId) throw new AppError("no_session", 401, "Create your model before entering the studio.");
    const body = await readJson(req);
    if (typeof body.profileId !== "string") throw new AppError("bad_request", 400, "Invalid request.");
    const row = await requestGeneration(ctx, userId, {
      profileId: body.profileId,
      selection: body.selection,
      // Mock-only error-state switch; ignored by real providers.
      mockFailure: readCookie(req, "sl_mock_fail") === "1",
    });
    return json({ generation: await generationDTO(ctx, row) }, { status: 202 });
  });
}
