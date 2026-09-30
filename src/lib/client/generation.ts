"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookKey, resolveLook, type LookSelection } from "@/domain/look";
import type { Profile } from "@/domain/profile";
import { GARMENT_CATEGORIES } from "@/domain/garment";
import { track } from "@/lib/analytics";
import { createTryOnProvider, type VirtualTryOnProvider, type TryOnError } from "@/lib/tryon";
import { sessionActions, type SessionState } from "./session-store";

export type GenerationPhase = "idle" | "generating" | "error";

export interface GenerationState {
  phase: GenerationPhase;
  /** User-facing message; never a raw provider error. */
  message?: string;
  pendingKey?: string;
}

const POLL_MS = 600;
const TIMEOUT_MS = 90_000;

export const GENERATION_MESSAGES: Record<TryOnError["code"], string> = {
  bad_input: "We couldn't use this photo. Try a clearer image with your face visible.",
  provider_failed: "That look didn't generate properly.",
  provider_unavailable: "Suit Lab is having trouble creating this look right now.",
  timeout: "Suit Lab is having trouble creating this look right now.",
};

let clientProvider: VirtualTryOnProvider | null = null;

/**
 * Phase 1: the mock provider runs in the browser.
 * Phase 2 replaces this with calls to the app's generation API; the hook's contract stays.
 */
function getProvider(): VirtualTryOnProvider {
  if (!clientProvider) {
    let failureRate = 0;
    try {
      failureRate = Number(window.localStorage.getItem("suitlab.mock.failureRate") ?? 0) || 0;
    } catch {}
    clientProvider = createTryOnProvider("mock", { failureRate });
  }
  return clientProvider;
}

export function setClientProviderForTests(p: VirtualTryOnProvider | null) {
  clientProvider = p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function findCachedResult(state: Pick<SessionState, "results">, profileId: string, key: string) {
  return state.results.find((r) => r.profileId === profileId && r.lookKey === key);
}

export function useGeneration(profile: Profile | null, results: SessionState["results"]) {
  const [state, setState] = useState<GenerationState>({ phase: "idle" });
  const inFlight = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const generate = useCallback(
    async (selection: LookSelection, source: "studio" | "stylist" = "studio") => {
      if (!profile || inFlight.current) return; // lock: ignore double clicks / concurrent requests
      const key = lookKey(selection);
      const cached = findCachedResult({ results }, profile.id, key);
      if (cached) {
        sessionActions.showResult(key);
        setState({ phase: "idle" });
        track("look_generation_completed", { cached: true, source });
        return;
      }

      inFlight.current = true;
      setState({ phase: "generating", pendingKey: key });
      const started = Date.now();
      track("look_generation_started", { source, ...selection });

      const fail = (code: TryOnError["code"]) => {
        track("look_generation_failed", { code, source });
        if (alive.current) setState({ phase: "error", message: GENERATION_MESSAGES[code], pendingKey: key });
      };

      try {
        const provider = getProvider();
        const resolved = resolveLook(selection);
        let job = await provider.submit({
          personImage: { url: profile.modelImageUrl },
          garments: GARMENT_CATEGORIES.map((c) => resolved[c]),
          options: { build: profile.build },
        });
        while (job.status === "queued" || job.status === "processing") {
          if (Date.now() - started > TIMEOUT_MS) return fail("timeout");
          if (!alive.current) return;
          await sleep(POLL_MS);
          job = await provider.getStatus(job.providerJobId);
        }
        if (job.status === "failed" || !job.outputUrl) return fail(job.error?.code ?? "provider_failed");

        sessionActions.addResult({
          profileId: profile.id,
          lookKey: key,
          selection,
          imageUrl: job.outputUrl,
          createdAt: new Date().toISOString(),
        });
        track("look_generation_completed", { cached: false, source, duration_ms: Date.now() - started });
        if (source === "stylist") track("ai_stylist_look_generated", {});
        if (alive.current) setState({ phase: "idle" });
      } catch {
        fail("provider_unavailable");
      } finally {
        inFlight.current = false;
      }
    },
    [profile, results],
  );

  const dismissError = useCallback(() => setState({ phase: "idle" }), []);

  return { ...state, generate, dismissError };
}
