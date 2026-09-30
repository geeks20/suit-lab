import { GARMENT_CATEGORIES, type GarmentCategory } from "@/domain/garment";
import type { ResolvedLook } from "@/domain/look";
import { getGarment } from "@/domain/wardrobe";
import { BUILDS, type Build } from "@/domain/profile";
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

interface MockJobState {
  r: number; // ready at (ms)
  f: 0 | 1; // fails
  g: string[]; // garment ids
  b?: Build;
}

const encode = (s: MockJobState) => `mock.${Buffer.from(JSON.stringify(s)).toString("base64url")}`;
function decode(id: string): MockJobState | null {
  if (!id.startsWith("mock.")) return null;
  try {
    const s = JSON.parse(Buffer.from(id.slice(5), "base64url").toString("utf8")) as MockJobState;
    return typeof s.r === "number" && Array.isArray(s.g) ? s : null;
  } catch {
    return null;
  }
}

/**
 * MOCK TRY-ON PROVIDER — development, demo and tests only.
 * Makes no network calls. Output is an illustration of the outfit, labelled as mock.
 * Stateless: job state is encoded in the job id, so it works across server requests.
 */
export class MockTryOnProvider implements VirtualTryOnProvider {
  readonly id = "mock";
  readonly model = "mock-illustration-v1";
  readonly optionsFingerprint = "mock";
  readonly capabilities = {
    categories: [...GARMENT_CATEGORIES],
    maxGarmentsPerCall: 4,
    async: true,
    requiresGarmentImage: false,
    realTryOn: false,
  };

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

  estimateCostCredits() {
    return 0;
  }

  async submit(request: TryOnRequest): Promise<TryOnJob> {
    if (!request.personImage.url) {
      return { providerJobId: "", status: "failed", error: { code: "bad_input", detail: "missing person image" } };
    }
    const fails = request.options?.mockFailure || this.random() < this.failureRate;
    const providerJobId = encode({
      r: this.now() + this.latencyMs,
      f: fails ? 1 : 0,
      g: request.garments.map((g) => g.id),
      b: request.options?.build,
    });
    return { providerJobId, status: "queued" };
  }

  async getStatus(providerJobId: string): Promise<TryOnJob> {
    const job = decode(providerJobId);
    if (!job) return { providerJobId, status: "failed", error: { code: "provider_failed", detail: "unknown job" } };
    if (this.now() < job.r) return { providerJobId, status: "processing" };
    if (job.f) return { providerJobId, status: "failed", error: { code: "provider_failed", detail: "simulated failure" } };

    const look: Partial<Record<GarmentCategory, ReturnType<typeof getGarment>>> = {};
    for (const id of job.g) {
      const g = getGarment(id);
      if (g) look[g.category] = g;
    }
    const complete = GARMENT_CATEGORIES.every((c) => look[c]);
    const build = job.b && (BUILDS as readonly string[]).includes(job.b) ? job.b : undefined;
    const svg = renderFigureSvg({
      look: complete ? (look as ResolvedLook) : null,
      build,
      caption: "MOCK TRY-ON · NO AI CALL MADE",
    });
    return { providerJobId, status: "completed", outputUrl: svgToDataUrl(svg) };
  }
}
