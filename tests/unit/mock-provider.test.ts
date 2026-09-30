import { describe, expect, it } from "vitest";
import { MockTryOnProvider } from "@/lib/tryon/mock-provider";
import { DEFAULT_LOOK, resolveLook } from "@/domain/look";
import { GARMENT_CATEGORIES } from "@/domain/garment";

const garments = () => {
  const r = resolveLook(DEFAULT_LOOK);
  return GARMENT_CATEGORIES.map((c) => r[c]);
};

describe("MockTryOnProvider", () => {
  it("moves a job through queued → processing → completed", async () => {
    let t = 0;
    const p = new MockTryOnProvider({ latencyMs: 1000, now: () => t });
    const job = await p.submit({ personImage: { url: "/demo-assets/model.svg" }, garments: garments() });
    expect(job.status).toBe("queued");
    expect((await p.getStatus(job.providerJobId)).status).toBe("processing");
    t = 1000;
    const done = await p.getStatus(job.providerJobId);
    expect(done.status).toBe("completed");
    expect(done.outputUrl).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(done.outputUrl!)).toContain("MOCK TRY-ON");
  });

  it("can simulate failures", async () => {
    const p = new MockTryOnProvider({ latencyMs: 0, failureRate: 1 });
    const job = await p.submit({ personImage: { url: "x" }, garments: garments() });
    const res = await p.getStatus(job.providerJobId);
    expect(res.status).toBe("failed");
    expect(res.error?.code).toBe("provider_failed");
  });

  it("rejects a missing person image", async () => {
    const p = new MockTryOnProvider();
    const job = await p.submit({ personImage: { url: "" }, garments: garments() });
    expect(job).toMatchObject({ status: "failed", error: { code: "bad_input" } });
  });
});
