// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_LOOK } from "@/domain/look";
import { generations, looks, profiles, users } from "@/server/db/schema";
import { createProfile } from "@/server/services/profiles";
import { refreshGeneration, requestGeneration, PROVIDER_POLL_MIN_INTERVAL_MS } from "@/server/services/generations";
import { deleteLook, listLooks, nextLookName, renameLook, saveLook } from "@/server/services/looks";
import { deleteUserData } from "@/server/services/privacy";
import { getSession } from "@/server/services/session";
import { FakeProvider, PNG_OUTPUT, makeCtx, makeUser, markGarmentReady, photo } from "./helpers";

const details = { heightCm: 183, weightKg: 72, build: "slim" as const };

async function userWithResult(env: Awaited<ReturnType<typeof makeCtx>>, provider: FakeProvider) {
  const userId = await makeUser(env.ctx);
  const profile = await createProfile(env.ctx, userId, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
  const gen = await requestGeneration(env.ctx, userId, { profileId: profile.id, selection: DEFAULT_LOOK });
  provider.statusQueue.push({ providerJobId: "job-1", status: "completed", outputUrl: await PNG_OUTPUT() });
  env.clock.advance(PROVIDER_POLL_MIN_INTERVAL_MS + 1);
  const done = await refreshGeneration(env.ctx, userId, gen.id);
  return { userId, profile, gen: done };
}

describe("saved looks", () => {
  it("saves the generated result with only the garments actually applied", async () => {
    const provider = new FakeProvider();
    const env = await makeCtx({ provider });
    await markGarmentReady(env.ctx);
    const { userId, gen } = await userWithResult(env, provider);
    const { look, alreadySaved } = await saveLook(env.ctx, userId, gen.id);
    expect(alreadySaved).toBe(false);
    expect(look).toMatchObject({ name: "Look 01", suitId: "suit-midnight-navy", shirtId: null, tieId: null, shoesId: null, generatedImageKey: gen.outputKey });
    expect((await saveLook(env.ctx, userId, gen.id)).alreadySaved).toBe(true);
    expect(await listLooks(env.ctx, userId)).toHaveLength(1);
  });

  it("renames and deletes only the owner's looks", async () => {
    const provider = new FakeProvider();
    const env = await makeCtx({ provider });
    await markGarmentReady(env.ctx);
    const { userId, gen } = await userWithResult(env, provider);
    const { look } = await saveLook(env.ctx, userId, gen.id);
    const mallory = await makeUser(env.ctx);
    await expect(renameLook(env.ctx, mallory, look.id, "mine now")).rejects.toMatchObject({ status: 404 });
    await expect(deleteLook(env.ctx, mallory, look.id)).rejects.toMatchObject({ status: 404 });
    await expect(saveLook(env.ctx, mallory, gen.id)).rejects.toMatchObject({ status: 404 });
    expect((await renameLook(env.ctx, userId, look.id, "  Riyadh dinner ")).name).toBe("Riyadh dinner");
    await expect(renameLook(env.ctx, userId, look.id, "   ")).rejects.toMatchObject({ status: 400 });
    await deleteLook(env.ctx, userId, look.id);
    expect(await listLooks(env.ctx, userId)).toHaveLength(0);
  });

  it("never reuses a taken default name", () => {
    expect(nextLookName([])).toBe("Look 01");
    expect(nextLookName(["Look 02", "Look 03"])).toBe("Look 04");
  });

  it("session payload contains signed URLs only", async () => {
    const provider = new FakeProvider();
    const env = await makeCtx({ provider });
    await markGarmentReady(env.ctx);
    const { userId, gen } = await userWithResult(env, provider);
    await saveLook(env.ctx, userId, gen.id);
    const s = await getSession(env.ctx, userId);
    expect(s.profile?.sourceImageUrl).toMatch(/sig=/);
    expect(s.generations[0].imageUrl).toMatch(/sig=/);
    expect(s.looks[0].imageUrl).toMatch(/sig=/);
    expect(JSON.stringify(s)).not.toMatch(/errorDetail|requestKey|providerJobId|base64/);
  });
});

describe("delete my photo, model and looks", () => {
  it("removes the user's storage objects and database rows, and nothing of anyone else's", async () => {
    const provider = new FakeProvider();
    const env = await makeCtx({ provider });
    const garmentKey = await markGarmentReady(env.ctx);
    const alice = await userWithResult(env, provider);
    await saveLook(env.ctx, alice.userId, alice.gen.id);
    const bob = await userWithResult(env, provider);

    const report = await deleteUserData(env.ctx, alice.userId);
    expect(report.storageObjectsDeleted).toBe(2); // source photo + generated look
    expect(report.providerJobs).toEqual([{ provider: "fake", count: 1 }]);
    expect([...env.storage.objects.keys()].some((k) => k.includes(alice.userId))).toBe(false);
    for (const t of [profiles, generations, looks]) {
      expect(await env.ctx.db.select().from(t).where(eq(t.userId, alice.userId))).toHaveLength(0);
    }
    expect(await env.ctx.db.select().from(users).where(eq(users.id, alice.userId))).toHaveLength(0);

    // Bob and shared garment assets are untouched.
    expect(env.storage.objects.has(bob.gen.outputKey!)).toBe(true);
    expect(env.storage.objects.has(garmentKey)).toBe(true);
    expect(await env.ctx.db.select().from(generations).where(eq(generations.userId, bob.userId))).toHaveLength(1);
  });
});
