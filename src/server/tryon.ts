import "server-only";
import { FashnVirtualTryOnProvider, MockTryOnProvider, type VirtualTryOnProvider } from "@/lib/tryon";
import { getConfig } from "./config";

const g = globalThis as unknown as { __suitlabProvider?: VirtualTryOnProvider };

/**
 * The configured provider. No real FASHN call can happen unless
 * VIRTUAL_TRYON_PROVIDER=fashn AND FASHN_API_KEY are both set.
 */
export function getProvider(): VirtualTryOnProvider {
  if (g.__suitlabProvider) return g.__suitlabProvider;
  const cfg = getConfig();
  if (cfg.VIRTUAL_TRYON_PROVIDER === "fashn") {
    if (!cfg.FASHN_API_KEY) throw new ProviderConfigError("VIRTUAL_TRYON_PROVIDER=fashn but FASHN_API_KEY is not set");
    g.__suitlabProvider = new FashnVirtualTryOnProvider({
      apiKey: cfg.FASHN_API_KEY,
      model: cfg.FASHN_MODEL,
      mode: cfg.FASHN_MODE,
      resolution: cfg.FASHN_RESOLUTION,
      returnBase64: cfg.FASHN_RETURN_BASE64,
    });
  } else {
    g.__suitlabProvider = new MockTryOnProvider();
  }
  return g.__suitlabProvider;
}

export class ProviderConfigError extends Error {}

export function setProviderForTests(p: VirtualTryOnProvider | null) {
  g.__suitlabProvider = p ?? undefined;
}
