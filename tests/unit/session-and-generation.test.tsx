import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_LOOK } from "@/domain/look";
import type { GenerationDTO, ProfileDTO } from "@/lib/api-types";

const api = vi.hoisted(() => ({
  session: vi.fn(),
  startGeneration: vi.fn(),
  getGeneration: vi.fn(),
  saveLook: vi.fn(),
  renameLook: vi.fn(),
  deleteLook: vi.fn(),
  deleteMe: vi.fn(),
  createProfile: vi.fn(),
  createDemoProfile: vi.fn(),
}));
vi.mock("@/lib/client/api", async (orig) => ({ ...(await orig<typeof import("@/lib/client/api")>()), api }));

import { __resetSessionForTests, appliedKey, sessionActions, useSession } from "@/lib/client/session-store";
import { useGeneration, GENERATION_MESSAGES, POLL_MS } from "@/lib/client/generation";
import { ApiError } from "@/lib/client/api";

const PROFILE: ProfileDTO = { id: "p1", heightCm: 183, weightKg: 72, build: "slim", isDemo: false, sourceImageUrl: "/api/files/x?sig=1", createdAt: "2026-01-01T00:00:00Z" };

const gen = (over: Partial<GenerationDTO> = {}): GenerationDTO => ({
  id: "g1",
  status: "processing",
  applied: { suit: "suit-midnight-navy" },
  lookKey: "suit-midnight-navy",
  imageUrl: null,
  errorMessage: null,
  cacheHit: false,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

function useHarness() {
  const results = useSession((s) => s.results);
  const displayedKey = useSession((s) => s.displayedKey);
  return { gen: useGeneration(PROFILE), results, displayedKey };
}

beforeEach(() => {
  localStorage.clear();
  __resetSessionForTests();
  Object.values(api).forEach((f) => f.mockReset());
  vi.useRealTimers();
});

describe("session store", () => {
  it("persists currentLook across reloads (and never stores images locally)", () => {
    sessionActions.selectGarment("tie", "tie-forest-green");
    __resetSessionForTests(); // simulate a page reload
    const { result } = renderHook(() => useSession((s) => s.currentLook));
    expect(result.current).toEqual({ ...DEFAULT_LOOK, tie: "tie-forest-green" });
    expect(localStorage.getItem("suitlab.studio.v2")).not.toMatch(/data:|base64|sig=/);
  });

  it("loads the profile, results and looks from the server", async () => {
    api.session.mockResolvedValue({
      profile: PROFILE,
      generations: [gen({ status: "completed", imageUrl: "/img?sig=1" })],
      looks: [],
      capabilities: { provider: "fashn", realTryOn: true, categories: ["suit"], readyGarmentIds: ["suit-midnight-navy"], demoSupported: false },
    });
    const { result } = renderHook(() => useSession((s) => s));
    await act(() => sessionActions.load());
    expect(result.current).toMatchObject({ hydrated: true, profile: PROFILE, capabilities: { realTryOn: true } });
    expect(result.current.results).toHaveLength(1);
  });

  it("computes the applied key from provider categories only", () => {
    expect(appliedKey(DEFAULT_LOOK, ["suit"])).toBe("suit-midnight-navy");
    expect(appliedKey(DEFAULT_LOOK)).toBe("suit-midnight-navy|shirt-crisp-white|tie-burgundy|shoes-black-oxford");
  });

  it("reverts an optimistic rename if the server rejects it", async () => {
    api.saveLook.mockResolvedValue({ look: { id: "l1", profileId: "p1", name: "Look 01", selection: {}, imageUrl: "x", generationId: "g1", createdAt: "" }, alreadySaved: false });
    await sessionActions.saveLook("g1");
    api.renameLook.mockRejectedValue(new ApiError("nope", 500, "x"));
    expect(await sessionActions.renameLook("l1", "New")).toBe(false);
    const { result } = renderHook(() => useSession((s) => s.looks));
    expect(result.current[0].name).toBe("Look 01");
  });
});

describe("generation hook", () => {
  it("starts a server generation, polls, and displays the result", async () => {
    api.startGeneration.mockResolvedValue({ generation: gen({ status: "queued" }) });
    api.getGeneration
      .mockResolvedValueOnce({ generation: gen({ status: "processing" }) })
      .mockResolvedValueOnce({ generation: gen({ status: "completed", imageUrl: "/api/files/out.png?sig=1" }) });
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    expect(api.startGeneration).toHaveBeenCalledWith("p1", DEFAULT_LOOK);
    expect(api.getGeneration).toHaveBeenCalledTimes(2);
    expect(result.current.results[0].imageUrl).toBe("/api/files/out.png?sig=1");
    expect(result.current.displayedKey).toBe("suit-midnight-navy");
    expect(result.current.gen.phase).toBe("idle");
  }, POLL_MS * 4);

  it("ignores duplicate requests while one is in flight (double click)", async () => {
    api.startGeneration.mockResolvedValue({ generation: gen({ status: "completed", imageUrl: "/x?sig=1", cacheHit: true }) });
    const { result } = renderHook(useHarness);
    await act(async () => {
      await Promise.all([result.current.gen.generate(DEFAULT_LOOK), result.current.gen.generate(DEFAULT_LOOK), result.current.gen.generate({ ...DEFAULT_LOOK, tie: "tie-navy" })]);
    });
    expect(api.startGeneration).toHaveBeenCalledOnce();
  });

  it("shows the server's friendly message on failure", async () => {
    api.startGeneration.mockResolvedValue({ generation: gen({ status: "failed", errorMessage: GENERATION_MESSAGES.provider_failed }) });
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    await waitFor(() => expect(result.current.gen.phase).toBe("error"));
    expect(result.current.gen.message).toBe(GENERATION_MESSAGES.provider_failed);
    expect(result.current.results).toHaveLength(0);
  });

  it("shows friendly API errors (e.g. rate limit) and recovers on retry", async () => {
    api.startGeneration.mockRejectedValueOnce(new ApiError("rate_limited", 429, "You've generated a lot of looks this hour. Please try again a little later."));
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    expect(result.current.gen.message).toMatch(/lot of looks/);
    api.startGeneration.mockResolvedValueOnce({ generation: gen({ status: "completed", imageUrl: "/x?sig=1" }) });
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    expect(result.current.gen.phase).toBe("idle");
    expect(result.current.results).toHaveLength(1);
  });

  it("never shows raw network errors", async () => {
    api.startGeneration.mockRejectedValue(new TypeError("Failed to fetch: ECONNRESET 10.0.0.1"));
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    expect(result.current.gen.message).toBe(GENERATION_MESSAGES.provider_unavailable);
  });
});
