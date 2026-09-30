// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_LOOK } from "@/domain/look";
import { FashnVirtualTryOnProvider, MockTryOnProvider } from "@/lib/tryon";
import { GENERATION_MESSAGES } from "@/lib/messages";
import { generations } from "@/server/db/schema";
import { createDemoProfile, createProfile } from "@/server/services/profiles";
import { generationDTO, getCapabilities, refreshGeneration, requestGeneration, PROVIDER_POLL_MIN_INTERVAL_MS } from "@/server/services/generations";
import { FakeProvider, PNG_OUTPUT, makeCtx, makeUser, markGarmentReady, photo } from "./helpers";

const details = { heightCm: 183, weightKg: 72, build: "slim" as const };

async function setup(provider = new FakeProvider()) {
  const env = await makeCtx({ provider });
  const userId = await makeUser(env.ctx);
  const profile = await createProfile(env.ctx, userId, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
  return { ...env, provider, userId, profile };
}

async function completeViaPolling(env: Awaited<ReturnType<typeof setup>>, id: string) {
  env.provider.statusQueue.push({ providerJobId: "job-1", status: "completed", outputUrl: await PNG_OUTPUT() });
  env.clock.advance(PROVIDER_POLL_MIN_INTERVAL_MS + 1);
  return refreshGeneration(env.ctx, env.userId, id);
}

describe("generation creation (one real garment)", () => {
  it("refuses a garment without a provider-grade photo, without calling the provider", async () => {
    const env = await setup();
    await expect(requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK })).rejects.toMatchObject({ status: 422, code: "garment_not_ready" });
    expect(env.provider.submits).toHaveLength(0);
  });

  it("sends only the suit, as base64 data URIs (no private URLs leave the server)", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const gen = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });

    expect(gen).toMatchObject({ status: "queued", provider: "fake", providerModel: "fake-v1", providerJobId: "job-1", lookKey: "suit-midnight-navy" });
    expect(gen.inputData).toMatchObject({ applied: { suit: "suit-midnight-navy" } });
    const sent = env.provider.submits[0];
    expect(sent.garments.map((g) => g.id)).toEqual(["suit-midnight-navy"]);
    expect(sent.personImage.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(sent.garments[0].tryOnImage).toMatch(/^data:image\/jpeg;base64,/);
    const [row] = await env.ctx.db.select().from(generations).where(eq(generations.id, gen.id));
    expect(row.costCredits).toBe("1.00");
    expect(JSON.stringify(row.inputData)).not.toMatch(/base64|data:/);
  });

  it("walks queued → processing → completed and stores the output privately", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const gen = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });

    env.provider.statusQueue.push({ providerJobId: "job-1", status: "processing" });
    env.clock.advance(PROVIDER_POLL_MIN_INTERVAL_MS + 1);
    expect((await refreshGeneration(env.ctx, env.userId, gen.id)).status).toBe("processing");

    env.clock.advance(8000);
    const done = await completeViaPolling(env, gen.id);
    expect(done.status).toBe("completed");
    expect(done.outputKey).toBe(`users/${env.userId}/generations/${gen.id}.png`);
    expect(env.storage.objects.get(done.outputKey!)?.contentType).toBe("image/png");
    expect(done.durationMs).toBeGreaterThanOrEqual(8000);
    expect(done.cacheHit).toBe(false);

    const dto = await generationDTO(env.ctx, done);
    expect(dto.imageUrl).toMatch(/sig=/);
    expect(dto.applied).toEqual({ suit: "suit-midnight-navy" });

    // Terminal states never change again.
    env.clock.advance(60_000);
    expect((await refreshGeneration(env.ctx, env.userId, gen.id)).status).toBe("completed");
  });

  it("downloads https output only from the provider's documented CDN hosts", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const png = await photo(864, 1296, "png");
    const fetched: string[] = [];
    env.ctx.fetchImpl = (async (u: URL | string) => {
      fetched.push(String(u));
      return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
    }) as typeof fetch;

    const a = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    env.provider.statusQueue.push({ providerJobId: "job-1", status: "completed", outputUrl: "https://cdn.fashn.ai/job-1/output_0.png" });
    env.clock.advance(2000);
    expect((await refreshGeneration(env.ctx, env.userId, a.id)).status).toBe("completed");
    expect(fetched).toEqual(["https://cdn.fashn.ai/job-1/output_0.png"]);

    await markGarmentReady(env.ctx, "suit-charcoal");
    const b = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: { ...DEFAULT_LOOK, suit: "suit-charcoal" } });
    env.provider.statusQueue.push({ providerJobId: "job-1", status: "completed", outputUrl: "https://evil.example.com/x.png" });
    env.clock.advance(2000);
    const failed = await refreshGeneration(env.ctx, env.userId, b.id);
    expect(failed).toMatchObject({ status: "failed", errorCode: "provider_failed" });
    expect(fetched).toHaveLength(1);
  });

  it("does not let the demo model reach a real provider", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const demo = await createDemoProfile(env.ctx, env.userId);
    await expect(requestGeneration(env.ctx, env.userId, { profileId: demo.id, selection: DEFAULT_LOOK })).rejects.toMatchObject({ code: "demo_unsupported" });
    expect(env.provider.submits).toHaveLength(0);
  });

  it("rejects invented garments and other users' profiles", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    await expect(requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: { ...DEFAULT_LOOK, suit: "suit-gold-lame" } })).rejects.toMatchObject({ status: 400 });
    const mallory = await makeUser(env.ctx);
    await expect(requestGeneration(env.ctx, mallory, { profileId: env.profile.id, selection: DEFAULT_LOOK })).rejects.toMatchObject({ status: 404 });
  });

  it("reports capabilities honestly", async () => {
    const env = await setup();
    expect(await getCapabilities(env.ctx)).toMatchObject({ realTryOn: true, categories: ["suit"], readyGarmentIds: [], demoSupported: false });
    await markGarmentReady(env.ctx);
    expect((await getCapabilities(env.ctx)).readyGarmentIds).toEqual(["suit-midnight-navy"]);
  });
});

describe("failure, timeout and friendly errors", () => {
  it("records a provider failure and returns only a friendly message", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const gen = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    env.provider.statusQueue.push({ providerJobId: "job-1", status: "failed", error: { code: "provider_failed", detail: "PipelineError: CUDA OOM at node 7" } });
    env.clock.advance(2000);
    const failed = await refreshGeneration(env.ctx, env.userId, gen.id);
    expect(failed).toMatchObject({ status: "failed", errorCode: "provider_failed", errorDetail: "PipelineError: CUDA OOM at node 7" });
    const dto = await generationDTO(env.ctx, failed);
    expect(dto.errorMessage).toBe(GENERATION_MESSAGES.provider_failed);
    expect(JSON.stringify(dto)).not.toContain("CUDA");
  });

  it("fails immediately when submission is rejected", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    env.provider.submitResult = { providerJobId: "", status: "failed", error: { code: "provider_unavailable", detail: "HTTP 429 OutOfCredits" } };
    const gen = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    expect(gen).toMatchObject({ status: "failed", errorCode: "provider_unavailable" });
  });

  it("times out a job that never finishes", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const gen = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    env.clock.advance(env.ctx.limits.generationTimeoutSeconds * 1000 + 1);
    const out = await refreshGeneration(env.ctx, env.userId, gen.id);
    expect(out).toMatchObject({ status: "failed", errorCode: "timeout" });
    expect((await generationDTO(env.ctx, out)).errorMessage).toBe(GENERATION_MESSAGES.timeout);
  });

  it("reports a misconfigured provider without crashing", async () => {
    const { ctx } = await makeCtx({ provider: null });
    const userId = await makeUser(ctx);
    const p = await createDemoProfile(ctx, userId);
    await expect(requestGeneration(ctx, userId, { profileId: p.id, selection: DEFAULT_LOOK })).rejects.toMatchObject({ status: 503, userMessage: GENERATION_MESSAGES.provider_unavailable });
  });
});

describe("cost protection", () => {
  it("de-duplicates concurrent identical requests into one paid job", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    env.provider.submitDelayMs = 30;
    const req = { profileId: env.profile.id, selection: DEFAULT_LOOK };
    const results = await Promise.all([1, 2, 3, 4].map(() => requestGeneration(env.ctx, env.userId, req)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(env.provider.submits).toHaveLength(1);
  });

  it("reuses a cached result for the same photo + garment + provider settings", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const req = { profileId: env.profile.id, selection: DEFAULT_LOOK };
    const first = await requestGeneration(env.ctx, env.userId, req);
    const done = await completeViaPolling(env, first.id);

    // Shirt/tie/shoes are not applied by this provider, so changing them hits the same cache entry.
    const again = await requestGeneration(env.ctx, env.userId, { ...req, selection: { ...DEFAULT_LOOK, tie: "tie-navy" } });
    expect(again).toMatchObject({ status: "completed", cacheHit: true, cachedFromId: first.id, outputKey: done.outputKey, durationMs: 0, costCredits: "0.00" });
    expect(env.provider.submits).toHaveLength(1);
  });

  it("does not reuse the cache when the garment asset or provider settings change", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const req = { profileId: env.profile.id, selection: DEFAULT_LOOK };
    await completeViaPolling(env, (await requestGeneration(env.ctx, env.userId, req)).id);

    env.provider.optionsFingerprint = "opts-v2";
    const fresh = await requestGeneration(env.ctx, env.userId, req);
    expect(fresh.cacheHit).toBe(false);
    expect(env.provider.submits).toHaveLength(2);
  });

  it("throttles provider status checks no matter how fast the client polls", async () => {
    const env = await setup();
    await markGarmentReady(env.ctx);
    const gen = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    env.clock.advance(PROVIDER_POLL_MIN_INTERVAL_MS + 1);
    await Promise.all([1, 2, 3, 4, 5].map(() => refreshGeneration(env.ctx, env.userId, gen.id)));
    await refreshGeneration(env.ctx, env.userId, gen.id);
    expect(env.provider.statusCalls).toBe(1);
  });

  it("enforces the per-user hourly limit (cache hits are free)", async () => {
    const env = await setup();
    env.ctx.limits.generationUserHourly = 1;
    await markGarmentReady(env.ctx);
    await markGarmentReady(env.ctx, "suit-charcoal");
    const first = await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    await completeViaPolling(env, first.id);
    await expect(
      requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: { ...DEFAULT_LOOK, suit: "suit-charcoal" } }),
    ).rejects.toMatchObject({ status: 429 });
    expect((await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK })).cacheHit).toBe(true);
  });

  it("enforces the global in-flight cap for real providers", async () => {
    const env = await setup();
    env.ctx.limits.generationMaxInFlight = 1;
    await markGarmentReady(env.ctx);
    await markGarmentReady(env.ctx, "suit-charcoal");
    await requestGeneration(env.ctx, env.userId, { profileId: env.profile.id, selection: DEFAULT_LOOK });
    const other = await makeUser(env.ctx);
    const p2 = await createProfile(env.ctx, other, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
    await expect(requestGeneration(env.ctx, other, { profileId: p2.id, selection: { ...DEFAULT_LOOK, suit: "suit-charcoal" } })).rejects.toMatchObject({ status: 429 });
  });
});

describe("end-to-end with the real adapters (mocked HTTP only)", () => {
  it("runs a full job through the FASHN adapter against mocked responses", async () => {
    const png = await PNG_OUTPUT();
    const responses = [
      { id: "pred-1", error: null },
      { id: "pred-1", status: "in_queue", error: null },
      { id: "pred-1", status: "completed", output: [png.split(",")[1]], error: null },
    ];
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new FashnVirtualTryOnProvider({ apiKey: "test-key", fetchImpl });
    const env = await makeCtx({ provider });
    const userId = await makeUser(env.ctx);
    const profile = await createProfile(env.ctx, userId, { details, photo: { bytes: await photo(), type: "image/jpeg" } });
    await markGarmentReady(env.ctx);

    const gen = await requestGeneration(env.ctx, userId, { profileId: profile.id, selection: DEFAULT_LOOK });
    expect(gen).toMatchObject({ provider: "fashn", providerModel: "tryon-v1.6", providerJobId: "pred-1", costCredits: "1.00" });
    env.clock.advance(2000);
    expect((await refreshGeneration(env.ctx, userId, gen.id)).status).toBe("queued");
    env.clock.advance(2000);
    const done = await refreshGeneration(env.ctx, userId, gen.id);
    expect(done.status).toBe("completed");
    expect(env.storage.objects.get(done.outputKey!)?.contentType).toBe("image/png");
    expect(calls).toEqual(["https://api.fashn.ai/v1/run", "https://api.fashn.ai/v1/status/pred-1", "https://api.fashn.ai/v1/status/pred-1"]);
  });

  it("runs the mock provider for the demo model with the full outfit", async () => {
    const env = await makeCtx({ provider: new MockTryOnProvider({ latencyMs: 1000, now: () => env.clock.t }) });
    const userId = await makeUser(env.ctx);
    const demo = await createDemoProfile(env.ctx, userId);
    const gen = await requestGeneration(env.ctx, userId, { profileId: demo.id, selection: DEFAULT_LOOK });
    expect(gen.lookKey).toBe("suit-midnight-navy|shirt-crisp-white|tie-burgundy|shoes-black-oxford");
    env.clock.advance(2000);
    const done = await refreshGeneration(env.ctx, userId, gen.id);
    expect(done.status).toBe("completed");
    expect(env.storage.objects.get(done.outputKey!)?.contentType).toBe("image/svg+xml");
  });
});
