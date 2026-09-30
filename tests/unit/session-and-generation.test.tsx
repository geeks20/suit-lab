import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_LOOK, lookKey } from "@/domain/look";
import type { Profile } from "@/domain/profile";
import { __resetSessionForTests, sessionActions, useSession, nextLookName } from "@/lib/client/session-store";
import { setClientProviderForTests, useGeneration, GENERATION_MESSAGES } from "@/lib/client/generation";
import type { TryOnJob, TryOnRequest, VirtualTryOnProvider } from "@/lib/tryon";

const PROFILE: Profile = {
  id: "p1", heightCm: 183, weightKg: 72, build: "slim",
  sourceImageUrl: "data:image/jpeg;base64,x", modelImageUrl: "data:image/jpeg;base64,x",
  isDemo: false, createdAt: "2026-01-01T00:00:00Z",
};

function stubProvider(final: TryOnJob["status"] = "completed") {
  const submit = vi.fn<(req: TryOnRequest) => Promise<TryOnJob>>(async () => ({ providerJobId: "j1", status: "queued" }));
  const getStatus = vi.fn(async (): Promise<TryOnJob> =>
    final === "completed"
      ? { providerJobId: "j1", status: "completed", outputUrl: "data:image/png;base64,out" }
      : { providerJobId: "j1", status: "failed", error: { code: "provider_failed", detail: "RAW upstream 500 stack" } },
  );
  const p: VirtualTryOnProvider = { id: "stub", capabilities: { categories: ["suit"], maxGarmentsPerCall: 4, async: true }, submit, getStatus };
  setClientProviderForTests(p);
  return { submit, getStatus };
}

function useHarness() {
  const profile = useSession((s) => s.profile);
  const results = useSession((s) => s.results);
  const displayedKey = useSession((s) => s.displayedKey);
  return { gen: useGeneration(profile, results), results, displayedKey };
}

beforeEach(() => {
  localStorage.clear();
  __resetSessionForTests();
  setClientProviderForTests(null);
});

describe("session store", () => {
  it("persists currentLook across reloads", () => {
    sessionActions.selectGarment("tie", "tie-forest-green");
    __resetSessionForTests(); // simulate a page reload
    const { result } = renderHook(() => useSession((s) => s.currentLook));
    expect(result.current).toEqual({ ...DEFAULT_LOOK, tie: "tie-forest-green" });
  });

  it("saves looks with sequential default names, renames and deletes", () => {
    sessionActions.setProfile(PROFILE);
    const a = sessionActions.saveLook({ profileId: "p1", selection: DEFAULT_LOOK, imageUrl: "a" })!;
    const b = sessionActions.saveLook({ profileId: "p1", selection: DEFAULT_LOOK, imageUrl: "b" })!;
    expect([a.name, b.name]).toEqual(["Look 01", "Look 02"]);
    expect(sessionActions.renameLook(a.id, "  Riyadh dinner  ")).toBe(true);
    expect(sessionActions.renameLook(a.id, "   ")).toBe(false);
    const { result } = renderHook(() => useSession((s) => s.looks));
    expect(result.current.find((l) => l.id === a.id)?.name).toBe("Riyadh dinner");
    act(() => void sessionActions.deleteLook(b.id));
    expect(result.current).toHaveLength(1);
  });

  it("never reuses a default name that is taken", () => {
    const looks = [{ name: "Look 02" }, { name: "Look 03" }] as never;
    expect(nextLookName(looks)).toBe("Look 04");
  });

  it("resetAll removes the model, photo and looks", () => {
    sessionActions.setProfile(PROFILE);
    sessionActions.saveLook({ profileId: "p1", selection: DEFAULT_LOOK, imageUrl: "a" });
    sessionActions.resetAll();
    expect(JSON.parse(localStorage.getItem("suitlab.session.v1")!)).toMatchObject({ profile: null, looks: [], results: [] });
  });
});

describe("generation", () => {
  it("generates, stores and displays a result", async () => {
    const { submit } = stubProvider();
    sessionActions.setProfile(PROFILE);
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0]).toMatchObject({ personImage: { url: PROFILE.modelImageUrl } });
    expect(result.current.results[0]).toMatchObject({ lookKey: lookKey(DEFAULT_LOOK), imageUrl: "data:image/png;base64,out" });
    expect(result.current.displayedKey).toBe(lookKey(DEFAULT_LOOK));
    expect(result.current.gen.phase).toBe("idle");
  });

  it("ignores duplicate requests while one is in flight (double click)", async () => {
    const { submit } = stubProvider();
    sessionActions.setProfile(PROFILE);
    const { result } = renderHook(useHarness);
    await act(async () => {
      const a = result.current.gen.generate(DEFAULT_LOOK);
      const b = result.current.gen.generate(DEFAULT_LOOK);
      const c = result.current.gen.generate({ ...DEFAULT_LOOK, tie: "tie-navy" });
      await Promise.all([a, b, c]);
    });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("returns the cached result for an identical model + garment combination", async () => {
    const { submit } = stubProvider();
    sessionActions.setProfile(PROFILE);
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("shows a friendly error on failure and never the raw provider error", async () => {
    stubProvider("failed");
    sessionActions.setProfile(PROFILE);
    const { result } = renderHook(useHarness);
    await act(() => result.current.gen.generate(DEFAULT_LOOK));
    await waitFor(() => expect(result.current.gen.phase).toBe("error"));
    expect(result.current.gen.message).toBe(GENERATION_MESSAGES.provider_failed);
    expect(result.current.gen.message).not.toContain("RAW");
    expect(result.current.results).toHaveLength(0);
  });
});
