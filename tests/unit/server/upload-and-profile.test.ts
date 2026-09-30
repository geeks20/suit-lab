// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createProfile, createDemoProfile, getCurrentProfile, getOwnedProfile, profileDTO } from "@/server/services/profiles";
import { normaliseUpload, ImageRejected } from "@/server/images";
import { AppError } from "@/server/services/context";
import { makeCtx, makeUser, photo } from "./helpers";

const details = { heightCm: 183, weightKg: 72, build: "slim" as const };

describe("secure upload", () => {
  it("stores a normalised JPEG privately under the user's prefix and creates the profile", async () => {
    const { ctx, storage } = await makeCtx();
    const userId = await makeUser(ctx);
    const png = await photo(900, 1200, "png");
    const row = await createProfile(ctx, userId, { details, photo: { bytes: png, type: "image/png" } });

    expect(row.sourceImageKey).toBe(`users/${userId}/profiles/${row.id}/source.jpg`);
    const obj = storage.objects.get(row.sourceImageKey!)!;
    expect(obj.contentType).toBe("image/jpeg");
    expect((await sharp(obj.bytes).metadata()).format).toBe("jpeg");
    expect(row).toMatchObject({ heightCm: 183, weightKg: 72, build: "slim", isDemo: false });
  });

  it("strips EXIF metadata (e.g. GPS) and downsizes very large photos", async () => {
    const withExif = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: "#888" } })
      .withExif({ IFD0: { Copyright: "secret-location" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await normaliseUpload(withExif, "image/jpeg");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBe(2048);
  });

  it("exposes the photo only through a signed URL", async () => {
    const { ctx } = await makeCtx();
    const userId = await makeUser(ctx);
    const row = await createProfile(ctx, userId, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
    const dto = await profileDTO(ctx, row);
    expect(dto.sourceImageUrl).toMatch(/sig=/);
    expect(JSON.stringify(dto)).not.toContain("source_image_key");
  });
});

describe("invalid upload", () => {
  const reject = async (bytes: Buffer, type: string, reason: ImageRejected["reason"]) => {
    await expect(normaliseUpload(bytes, type)).rejects.toMatchObject({ reason });
  };

  it("rejects unsupported declared types", async () => reject(await photo(), "image/gif", "type"));
  it("rejects a declared type that doesn't match the content", async () => reject(await photo(600, 800, "png"), "image/jpeg", "mismatch"));
  it("rejects undecodable bytes", async () => reject(Buffer.from("definitely not an image"), "image/jpeg", "decode"));
  it("rejects SVG smuggled in as an image", async () => reject(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/png", "decode"));
  it("rejects images that are too small", async () => reject(await photo(300, 300), "image/jpeg", "dimensions"));
  it("rejects files over 15 MB", async () => reject(Buffer.alloc(15 * 1024 * 1024 + 1), "image/jpeg", "size"));

  it("maps rejections to friendly errors and stores nothing", async () => {
    const { ctx, storage } = await makeCtx();
    const userId = await makeUser(ctx);
    const err = await createProfile(ctx, userId, { details, photo: { bytes: Buffer.from("nope"), type: "image/jpeg" } }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(400);
    expect(err.userMessage).toBe("We couldn't use this photo. Try a clearer image with your face visible.");
    expect(storage.objects.size).toBe(0);
    expect(await getCurrentProfile(ctx, userId)).toBeNull();
  });
});

describe("profile persistence and ownership", () => {
  it("returns the latest profile for the user", async () => {
    const { ctx, clock } = await makeCtx();
    const userId = await makeUser(ctx);
    await createDemoProfile(ctx, userId);
    clock.advance(1000);
    const second = await createProfile(ctx, userId, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
    expect((await getCurrentProfile(ctx, userId))?.id).toBe(second.id);
  });

  it("never returns another user's profile (IDOR)", async () => {
    const { ctx } = await makeCtx();
    const alice = await makeUser(ctx);
    const mallory = await makeUser(ctx);
    const p = await createProfile(ctx, alice, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
    await expect(getOwnedProfile(ctx, mallory, p.id)).rejects.toMatchObject({ status: 404 });
    expect(await getCurrentProfile(ctx, mallory)).toBeNull();
  });

  it("rate-limits profile creation per user", async () => {
    const { ctx } = await makeCtx();
    ctx.limits.profileUserHourly = 2;
    const userId = await makeUser(ctx);
    await createDemoProfile(ctx, userId);
    await createDemoProfile(ctx, userId);
    await expect(createProfile(ctx, userId, { details, photo: { bytes: await photo(), type: "image/jpeg" } })).rejects.toMatchObject({ status: 429 });
  });
});
