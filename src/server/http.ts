import "server-only";
import { getConfig } from "./config";
import { getDb } from "./db/client";
import { log } from "./log";
import { AppError, DEFAULT_LIMITS, type ServiceContext } from "./services/context";
import { getStorage } from "./storage";
import { getProvider, ProviderConfigError } from "./tryon";

export async function getContext(): Promise<ServiceContext> {
  const cfg = getConfig();
  let provider = null;
  try {
    provider = getProvider();
  } catch (e) {
    if (!(e instanceof ProviderConfigError)) throw e;
    log("error", "provider.misconfigured", { message: e.message });
  }
  return {
    db: await getDb(),
    storage: getStorage(),
    provider,
    now: () => new Date(),
    limits: {
      ...DEFAULT_LIMITS,
      generationUserHourly: cfg.GENERATION_USER_HOURLY_LIMIT,
      generationGlobalDaily: cfg.GENERATION_GLOBAL_DAILY_LIMIT,
      generationMaxInFlight: cfg.GENERATION_MAX_IN_FLIGHT,
      generationTimeoutSeconds: cfg.GENERATION_TIMEOUT_SECONDS,
      profileUserHourly: cfg.PROFILE_USER_HOURLY_LIMIT,
      signedUrlTtlSeconds: cfg.SIGNED_URL_TTL_SECONDS,
    },
  };
}

export function json(body: unknown, init: ResponseInit & { setCookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  if (init.setCookie) headers.append("Set-Cookie", init.setCookie);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function errorResponse(code: string, status: number, message: string) {
  return json({ error: { code, message } }, { status });
}

/** Rejects cross-site mutating requests (cookie auth + SameSite=Lax is the first line; this is the second). */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients / same-origin fetches from some browsers
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {}
  if (!ok) throw new AppError("forbidden", 403, "Request blocked.");
}

export async function handle(req: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    assertSameOrigin(req);
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      if (e.status >= 500 || e.detail) log("warn", "api.error", { code: e.code, status: e.status, detail: e.detail });
      return errorResponse(e.code, e.status, e.userMessage);
    }
    log("error", "api.unhandled", { name: (e as Error).name, message: (e as Error).message });
    return errorResponse("internal", 500, "Suit Lab is having trouble right now. Please try again.");
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new AppError("bad_request", 400, "Invalid request.");
  }
}
