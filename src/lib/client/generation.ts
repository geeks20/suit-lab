"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LookSelection } from "@/domain/look";
import type { GenerationDTO, ProfileDTO } from "@/lib/api-types";
import { track } from "@/lib/analytics";
import { GENERATION_MESSAGES } from "@/lib/messages";
import { api, ApiError } from "./api";
import { sessionActions } from "./session-store";

export { GENERATION_MESSAGES };

export type GenerationPhase = "idle" | "generating" | "error";

export interface GenerationState {
  phase: GenerationPhase;
  /** User-facing message; never a raw provider error. */
  message?: string;
}

export const POLL_MS = 1500;
/** Client-side ceiling; the server also times jobs out on its own. */
export const CLIENT_TIMEOUT_MS = 5 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a server-side generation and polls it until it finishes.
 * One in flight at a time (double clicks are ignored); identical requests are
 * de-duplicated and cached by the server.
 */
export function useGeneration(profile: ProfileDTO | null) {
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
      if (!profile || inFlight.current) return;
      inFlight.current = true;
      setState({ phase: "generating" });
      const started = Date.now();
      track("look_generation_started", { source, ...selection });

      const fail = (message: string, code: string) => {
        track("look_generation_failed", { code, source });
        if (alive.current) setState({ phase: "error", message });
      };

      try {
        let { generation } = await api.startGeneration(profile.id, selection);
        while (generation.status === "queued" || generation.status === "processing") {
          if (!alive.current) return;
          if (Date.now() - started > CLIENT_TIMEOUT_MS) return fail(GENERATION_MESSAGES.timeout, "client_timeout");
          await sleep(POLL_MS);
          ({ generation } = await api.getGeneration(generation.id));
        }
        if (generation.status === "failed" || !generation.imageUrl) {
          return fail(generation.errorMessage ?? GENERATION_MESSAGES.provider_failed, "failed");
        }
        sessionActions.addResult(generation as GenerationDTO);
        track("look_generation_completed", { cached: generation.cacheHit, source, duration_ms: Date.now() - started });
        if (source === "stylist") track("ai_stylist_look_generated", {});
        if (alive.current) setState({ phase: "idle" });
      } catch (e) {
        fail(e instanceof ApiError ? e.message : GENERATION_MESSAGES.provider_unavailable, e instanceof ApiError ? e.code : "network");
      } finally {
        inFlight.current = false;
      }
    },
    [profile],
  );

  const dismissError = useCallback(() => setState({ phase: "idle" }), []);

  return { ...state, generate, dismissError };
}
