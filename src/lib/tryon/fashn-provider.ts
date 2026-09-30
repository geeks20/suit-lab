import type { TryOnError, TryOnJob, TryOnRequest, VirtualTryOnProvider } from "./types";

/**
 * FASHN virtual try-on adapter.
 *
 * Built against the official docs (docs.fashn.ai, checked 2026-10-01):
 *   POST https://api.fashn.ai/v1/run        { model_name, inputs }  → { id, error }
 *   GET  https://api.fashn.ai/v1/status/{id}                        → { id, status, output?, error? }
 *   status: starting | in_queue | processing | completed | failed
 *   Auth:   Authorization: Bearer <key>
 *   tryon-v1.6 inputs: model_image, garment_image, category, garment_photo_type, mode, seed, num_samples, output_format, return_base64
 *   tryon-max  inputs: model_image, product_image, prompt, resolution, generation_mode, seed, num_images, output_format, return_base64
 *   Images: URL or base64 data URI. Failed predictions do not consume credits.
 *
 * Applies exactly ONE garment per call. Multi-garment layering is out of scope (Phase 3).
 */

export type FashnModel = "tryon-v1.6" | "tryon-max";

export interface FashnOptions {
  apiKey: string;
  model?: FashnModel;
  /** v1.6: performance|balanced|quality (default quality). max: fast|balanced|quality (default balanced). */
  mode?: string;
  /** tryon-max only. */
  resolution?: "1k" | "2k" | "4k";
  returnBase64?: boolean;
  seed?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const V16_MODES = ["performance", "balanced", "quality"] as const;
const MAX_MODES = ["fast", "balanced", "quality"] as const;
/** Documented tryon-max credit table: mode × resolution. */
const MAX_CREDITS: Record<string, Record<string, number>> = {
  fast: { "1k": 1, "2k": 2, "4k": 3 },
  balanced: { "1k": 2, "2k": 3, "4k": 4 },
  quality: { "1k": 3, "2k": 4, "4k": 5 },
};

/** Runtime error names from the FASHN error-handling guide → our codes. */
const RUNTIME_ERRORS: Record<string, TryOnError["code"]> = {
  ImageLoadError: "bad_input",
  ContentModerationError: "bad_input",
  InputValidationError: "bad_input",
  ThirdPartyError: "provider_unavailable",
  UnavailableError: "provider_unavailable",
  PipelineError: "provider_failed",
};

export class FashnVirtualTryOnProvider implements VirtualTryOnProvider {
  readonly id = "fashn";
  readonly model: FashnModel;
  readonly capabilities = {
    categories: ["suit" as const],
    maxGarmentsPerCall: 1,
    async: true,
    requiresGarmentImage: true,
    realTryOn: true,
  };
  readonly optionsFingerprint: string;

  private apiKey: string;
  private mode: string;
  private resolution: "1k" | "2k" | "4k";
  private returnBase64: boolean;
  private seed: number;
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: FashnOptions) {
    if (!opts.apiKey) throw new Error("FASHN_API_KEY is not configured");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "tryon-v1.6";
    const modes: readonly string[] = this.model === "tryon-max" ? MAX_MODES : V16_MODES;
    const fallback = this.model === "tryon-max" ? "balanced" : "quality";
    this.mode = opts.mode && modes.includes(opts.mode) ? opts.mode : fallback;
    this.resolution = opts.resolution ?? "1k";
    this.returnBase64 = opts.returnBase64 ?? true;
    this.seed = opts.seed ?? 42;
    this.baseUrl = (opts.baseUrl ?? "https://api.fashn.ai/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.optionsFingerprint = [this.model, this.mode, this.model === "tryon-max" ? this.resolution : "", this.seed, "png"].join(":");
  }

  estimateCostCredits(): number | null {
    // One output image per job (num_samples / num_images = 1).
    if (this.model === "tryon-v1.6") return 1;
    return MAX_CREDITS[this.mode]?.[this.resolution] ?? null;
  }

  buildRunBody(request: TryOnRequest) {
    const garment = request.garments[0];
    if (request.garments.length !== 1 || !garment?.tryOnImage) throw new Error("FASHN adapter needs exactly one garment with a try-on image");
    const common = {
      model_image: request.personImage.url,
      seed: request.options?.seed ?? this.seed,
      output_format: "png",
      return_base64: this.returnBase64,
    };
    if (this.model === "tryon-max") {
      return {
        model_name: "tryon-max",
        inputs: { ...common, product_image: garment.tryOnImage, generation_mode: this.mode, resolution: this.resolution, num_images: 1 },
      };
    }
    return {
      model_name: "tryon-v1.6",
      inputs: { ...common, garment_image: garment.tryOnImage, category: "auto", garment_photo_type: "auto", mode: this.mode, num_samples: 1 },
    };
  }

  private async call(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...init.headers },
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: res.ok, status: res.status, body };
    } finally {
      clearTimeout(t);
    }
  }

  async submit(request: TryOnRequest): Promise<TryOnJob> {
    let body;
    try {
      body = this.buildRunBody(request);
    } catch (e) {
      return { providerJobId: "", status: "failed", error: { code: "bad_input", detail: (e as Error).message } };
    }
    let res;
    try {
      res = await this.call("/run", { method: "POST", body: JSON.stringify(body) });
    } catch (e) {
      return { providerJobId: "", status: "failed", error: { code: "provider_unavailable", detail: `run request failed: ${(e as Error).name}` } };
    }
    const id = typeof res.body?.id === "string" ? res.body.id : "";
    if (!res.ok || !id || res.body?.error) {
      return { providerJobId: id, status: "failed", error: httpError(res.status, res.body) };
    }
    return { providerJobId: id, status: "queued" };
  }

  async getStatus(providerJobId: string): Promise<TryOnJob> {
    let res;
    try {
      res = await this.call(`/status/${encodeURIComponent(providerJobId)}`, { method: "GET" });
    } catch (e) {
      // Transient: report still processing; the pipeline's own timeout bounds this.
      return { providerJobId, status: "processing", error: { code: "provider_unavailable", detail: `status request failed: ${(e as Error).name}` } };
    }
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) return { providerJobId, status: "processing" };
      return { providerJobId, status: "failed", error: httpError(res.status, res.body) };
    }
    const status = res.body?.status;
    if (status === "starting" || status === "in_queue") return { providerJobId, status: "queued" };
    if (status === "processing") return { providerJobId, status: "processing" };
    if (status === "completed") {
      const output = Array.isArray(res.body?.output) ? (res.body.output as unknown[])[0] : undefined;
      if (typeof output !== "string" || !output || output === "_expired") {
        return { providerJobId, status: "failed", error: { code: "provider_failed", detail: output === "_expired" ? "output expired" : "no output" } };
      }
      return { providerJobId, status: "completed", outputUrl: normaliseOutput(output) };
    }
    if (status === "failed") {
      const err = res.body?.error as { name?: string; message?: string } | undefined;
      const name = err?.name ?? "UnknownError";
      return { providerJobId, status: "failed", error: { code: RUNTIME_ERRORS[name] ?? "provider_failed", detail: `${name}: ${err?.message ?? ""}`.slice(0, 300) } };
    }
    return { providerJobId, status: "processing" };
  }
}

/** Output is a CDN URL, or base64 (possibly without a data: prefix) when return_base64 is set. */
function normaliseOutput(output: string): string {
  if (output.startsWith("https://") || output.startsWith("data:")) return output;
  return `data:image/png;base64,${output}`;
}

function httpError(status: number, body: Record<string, unknown> | null): TryOnError {
  const name = typeof body?.error === "string" ? body.error : (body?.error as { name?: string } | undefined)?.name;
  const detail = `HTTP ${status}${name ? ` ${name}` : ""}`;
  if (status === 400) return { code: "bad_input", detail };
  return { code: "provider_unavailable", detail };
}
