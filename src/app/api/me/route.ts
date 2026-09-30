import { getContext, handle, json } from "@/server/http";
import { deleteUserData } from "@/server/services/privacy";
import { getSessionUser, sessionCookieHeader } from "@/server/session";

/** "Delete my photo, model and looks": removes stored images and all rows, then ends the session. */
export async function DELETE(req: Request) {
  return handle(req, async () => {
    const ctx = await getContext();
    const userId = await getSessionUser(ctx.db, req);
    const report = userId ? await deleteUserData(ctx, userId) : { storageObjectsDeleted: 0, providerJobs: [] };
    return json({ ok: true, report }, { setCookie: sessionCookieHeader(null) });
  });
}
