import { getContext, handle, json } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { getSession } from "@/server/services/session";

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await getContext();
    const userId = await getSessionUser(ctx.db, req);
    return json(await getSession(ctx, userId));
  });
}
