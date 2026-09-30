import { getContext, handle, json } from "@/server/http";
import { createDemoProfile, profileDTO } from "@/server/services/profiles";
import { ensureSessionUser, sessionCookieHeader } from "@/server/session";

/** DEMO MODE: an illustrated sample model. Works with the mock provider only. */
export async function POST(req: Request) {
  return handle(req, async () => {
    const ctx = await getContext();
    const { userId, created } = await ensureSessionUser(ctx.db, req);
    const row = await createDemoProfile(ctx, userId);
    return json({ profile: await profileDTO(ctx, row) }, { status: 201, setCookie: created ? sessionCookieHeader(userId) : undefined });
  });
}
