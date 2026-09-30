import { MockTryOnProvider, type MockProviderOptions } from "./mock-provider";
import type { VirtualTryOnProvider } from "./types";

export type { VirtualTryOnProvider, TryOnRequest, TryOnJob, TryOnError, GenerationStatus } from "./types";

export type ProviderId = "mock" | "fashn";

/**
 * Resolves the configured provider. Only the mock exists in Phase 1;
 * real providers (FASHN first) are added in Phase 2 behind the same interface.
 */
export function createTryOnProvider(id: ProviderId = "mock", mockOptions?: MockProviderOptions): VirtualTryOnProvider {
  switch (id) {
    case "mock":
      return new MockTryOnProvider(mockOptions);
    case "fashn":
      throw new Error("FASHN provider is not configured yet (Phase 2).");
  }
}
