import { getContext, handle, json } from "@/server/http";
import { AppError } from "@/server/services/context";
import { createProfile, parseDetails, profileDTO } from "@/server/services/profiles";
import { MAX_UPLOAD_BYTES, UPLOAD_ERROR_MESSAGES } from "@/server/images";
import { ensureSessionUser, sessionCookieHeader } from "@/server/session";

/** Secure upload: multipart { photo, heightCm, weightKg, build } → private storage + profile row. */
export async function POST(req: Request) {
  return handle(req, async () => {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new AppError("upload_size", 413, UPLOAD_ERROR_MESSAGES.size);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError("bad_request", 400, UPLOAD_ERROR_MESSAGES.decode);
    }
    const photo = form.get("photo");
    if (!(photo instanceof File)) throw new AppError("upload_missing", 400, UPLOAD_ERROR_MESSAGES.decode);
    if (photo.size > MAX_UPLOAD_BYTES) throw new AppError("upload_size", 413, UPLOAD_ERROR_MESSAGES.size);
    const details = parseDetails({
      heightCm: Number(form.get("heightCm")),
      weightKg: Number(form.get("weightKg")),
      build: form.get("build"),
    });

    const ctx = await getContext();
    const { userId, created } = await ensureSessionUser(ctx.db, req);
    const row = await createProfile(ctx, userId, { details, photo: { bytes: Buffer.from(await photo.arrayBuffer()), type: photo.type } });
    return json({ profile: await profileDTO(ctx, row) }, { status: 201, setCookie: created ? sessionCookieHeader(userId) : undefined });
  });
}
