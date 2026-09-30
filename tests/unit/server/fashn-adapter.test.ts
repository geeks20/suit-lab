// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FashnVirtualTryOnProvider } from "@/lib/tryon/fashn-provider";
import { getGarment } from "@/domain/wardrobe";
import type { TryOnRequest } from "@/lib/tryon";

type Call = { url: string; init: RequestInit };

/** Mocked FASHN HTTP API. Responses mirror the documented shapes. */
function fakeFetch(responses: Array<{ status?: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more fake responses");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const request = (): TryOnRequest => ({
  personImage: { url: "data:image/jpeg;base64,PERSON" },
  garments: [{ ...getGarment("suit-midnight-navy")!, tryOnImage: "data:image/jpeg;base64,GARMENT" }],
});

describe("FashnVirtualTryOnProvider", () => {
  it("refuses to exist without an API key (no accidental calls)", () => {
    expect(() => new FashnVirtualTryOnProvider({ apiKey: "" })).toThrow(/FASHN_API_KEY/);
  });

  it("declares one-garment, suit-only, real try-on capabilities", () => {
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", fetchImpl: fakeFetch([]).impl });
    expect(p.capabilities).toMatchObject({ categories: ["suit"], maxGarmentsPerCall: 1, requiresGarmentImage: true, realTryOn: true });
  });

  it("submits the documented tryon-v1.6 payload with bearer auth", async () => {
    const f = fakeFetch([{ body: { id: "pred-123", error: null } }]);
    const p = new FashnVirtualTryOnProvider({ apiKey: "sk_test", fetchImpl: f.impl });
    const job = await p.submit(request());
    expect(job).toEqual({ providerJobId: "pred-123", status: "queued" });
    expect(f.calls[0].url).toBe("https://api.fashn.ai/v1/run");
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test");
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({
      model_name: "tryon-v1.6",
      inputs: {
        model_image: "data:image/jpeg;base64,PERSON",
        garment_image: "data:image/jpeg;base64,GARMENT",
        category: "auto",
        garment_photo_type: "auto",
        mode: "quality",
        num_samples: 1,
        seed: 42,
        output_format: "png",
        return_base64: true,
      },
    });
  });

  it("submits the documented tryon-max payload", async () => {
    const f = fakeFetch([{ body: { id: "pred-9", error: null } }]);
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", model: "tryon-max", resolution: "2k", fetchImpl: f.impl });
    await p.submit(request());
    const body = JSON.parse(f.calls[0].init.body as string);
    expect(body.model_name).toBe("tryon-max");
    expect(body.inputs).toMatchObject({ product_image: "data:image/jpeg;base64,GARMENT", generation_mode: "balanced", resolution: "2k", num_images: 1 });
    expect(body.inputs.garment_image).toBeUndefined();
  });

  it("uses documented credit costs only", () => {
    expect(new FashnVirtualTryOnProvider({ apiKey: "k" }).estimateCostCredits()).toBe(1);
    expect(new FashnVirtualTryOnProvider({ apiKey: "k", model: "tryon-max", mode: "quality", resolution: "4k" }).estimateCostCredits()).toBe(5);
    expect(new FashnVirtualTryOnProvider({ apiKey: "k", model: "tryon-max", mode: "fast", resolution: "1k" }).estimateCostCredits()).toBe(1);
  });

  it("rejects requests it can't honour without calling the API", async () => {
    const f = fakeFetch([]);
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", fetchImpl: f.impl });
    const noImage = await p.submit({ ...request(), garments: [getGarment("suit-charcoal")!] });
    expect(noImage).toMatchObject({ status: "failed", error: { code: "bad_input" } });
    const two = await p.submit({ ...request(), garments: [...request().garments, ...request().garments] });
    expect(two.status).toBe("failed");
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    [401, { error: "UnauthorizedAccess", message: "Invalid or missing API key" }, "provider_unavailable"],
    [429, { error: "OutOfCredits", message: "No API credits remaining" }, "provider_unavailable"],
    [429, { error: "ConcurrencyLimitExceeded" }, "provider_unavailable"],
    [500, { error: "InternalServerError" }, "provider_unavailable"],
    [400, { error: "BadRequest" }, "bad_input"],
  ])("maps HTTP %i on /run to %s", async (status, body, code) => {
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", fetchImpl: fakeFetch([{ status, body }]).impl });
    const job = await p.submit(request());
    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe(code);
  });

  it("treats network errors on /run as provider unavailable", async () => {
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", fetchImpl: fakeFetch([new TypeError("fetch failed")]).impl });
    expect((await p.submit(request())).error?.code).toBe("provider_unavailable");
  });

  it("maps every documented status", async () => {
    const f = fakeFetch([
      { body: { id: "p", status: "starting", error: null } },
      { body: { id: "p", status: "in_queue", error: null } },
      { body: { id: "p", status: "processing", error: null } },
      { body: { id: "p", status: "completed", output: ["https://cdn.fashn.ai/p/output_0.png"], error: null } },
    ]);
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", fetchImpl: f.impl });
    expect((await p.getStatus("p")).status).toBe("queued");
    expect((await p.getStatus("p")).status).toBe("queued");
    expect((await p.getStatus("p")).status).toBe("processing");
    expect(await p.getStatus("p")).toMatchObject({ status: "completed", outputUrl: "https://cdn.fashn.ai/p/output_0.png" });
    expect(f.calls[0].url).toBe("https://api.fashn.ai/v1/status/p");
    expect(f.calls[0].init.method).toBe("GET");
  });

  it("normalises base64 output and detects expired output", async () => {
    const f = fakeFetch([
      { body: { id: "p", status: "completed", output: ["iVBORw0KGgo="], error: null } },
      { body: { id: "p", status: "completed", output: ["_expired"], error: null } },
    ]);
    const p = new FashnVirtualTryOnProvider({ apiKey: "k", fetchImpl: f.impl });
    expect((await p.getStatus("p")).outputUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(await p.getStatus("p")).toMatchObject({ status: "failed", error: { code: "provider_failed" } });
  });

  it.each([
    ["ImageLoadError", "bad_input"],
    ["ContentModerationError", "bad_input"],
    ["InputValidationError", "bad_input"],
    ["UnavailableError", "provider_unavailable"],
    ["ThirdPartyError", "provider_unavailable"],
    ["PipelineError", "provider_failed"],
    ["SomethingNew", "provider_failed"],
  ])("maps runtime error %s to %s", async (name, code) => {
    const p = new FashnVirtualTryOnProvider({
      apiKey: "k",
      fetchImpl: fakeFetch([{ body: { id: "p", status: "failed", error: { name, message: "raw detail" } } }]).impl,
    });
    expect(await p.getStatus("p")).toMatchObject({ status: "failed", error: { code } });
  });

  it("keeps polling through transient status errors (429/5xx/network)", async () => {
    const p = new FashnVirtualTryOnProvider({
      apiKey: "k",
      fetchImpl: fakeFetch([{ status: 429, body: { error: "RateLimitExceeded" } }, { status: 503, body: {} }, new TypeError("reset")]).impl,
    });
    expect((await p.getStatus("p")).status).toBe("processing");
    expect((await p.getStatus("p")).status).toBe("processing");
    expect((await p.getStatus("p")).status).toBe("processing");
  });
});
