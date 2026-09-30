import { GARMENT_CATEGORIES } from "@/domain/garment";
import type { ResolvedLook } from "@/domain/look";
import { renderFigureSvg } from "@/lib/art/figure";
import { svgToDataUrl } from "@/lib/art/color";
import type { TryOnJob, TryOnRequest, VirtualTryOnProvider } from "./types";

export interface MockProviderOptions {
  /** Simulated processing time. */
  latencyMs?: number;
  /** 0..1 chance a job fails, for exercising error states. */
  failureRate?: number;
  now?: () => number;
  random?: () => number;
}

interface MockJobRecord {
  readyAt: number;
  fails: boolean;
  request: TryOnRequest;
}

/**
 * MOCK TRY-ON PROVIDER — development, demo and tests only.
 * Makes no network calls. Output is an illustration of the outfit, labelled as mock.
 */
export class MockTryOnProvider implements VirtualTryOnProvider {
  readonly id = "mock";
  readonly capabilities = { categories: [...GARMENT_CATEGORIES], maxGarmentsPerCall: 4, async: true };

  private jobs = new Map<string, MockJobRecord>();
  private seq = 0;
  private latencyMs: number;
  private failureRate: number;
  private now: () => number;
  private random: () => number;

  constructor(opts: MockProviderOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 2600;
    this.failureRate = opts.failureRate ?? 0;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  async submit(request: TryOnRequest): Promise<TryOnJob> {
    if (!request.personImage.url) {
      return { providerJobId: "", status: "failed", error: { code: "bad_input", detail: "missing person image" } };
    }
    const providerJobId = `mock_${++this.seq}_${Math.floor(this.random() * 1e9).toString(36)}`;
    this.jobs.set(providerJobId, {
      readyAt: this.now() + this.latencyMs,
      fails: this.random() < this.failureRate,
      request,
    });
    return { providerJobId, status: "queued" };
  }

  async getStatus(providerJobId: string): Promise<TryOnJob> {
    const job = this.jobs.get(providerJobId);
    if (!job) return { providerJobId, status: "failed", error: { code: "provider_failed", detail: "unknown job" } };
    if (this.now() < job.readyAt) return { providerJobId, status: "processing" };
    this.jobs.delete(providerJobId);
    if (job.fails) return { providerJobId, status: "failed", error: { code: "provider_failed", detail: "simulated failure" } };

    const look = Object.fromEntries(job.request.garments.map((g) => [g.category, g])) as ResolvedLook;
    const complete = GARMENT_CATEGORIES.every((c) => look[c]);
    const svg = renderFigureSvg({
      look: complete ? look : null,
      build: job.request.options?.build,
      caption: "MOCK TRY-ON · NO AI CALL MADE",
    });
    return { providerJobId, status: "completed", outputUrl: svgToDataUrl(svg) };
  }
}
