import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CapabilitiesDTO, SessionDTO } from "@/lib/api-types";

const api = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({ ...(await orig<typeof import("@/lib/client/api")>()), api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { Studio } from "@/components/studio/studio";
import { __resetSessionForTests } from "@/lib/client/session-store";

const REAL: CapabilitiesDTO = { provider: "fashn", realTryOn: true, categories: ["suit"], readyGarmentIds: ["suit-midnight-navy"], demoSupported: false };
const profile = (isDemo = false) => ({ id: "p1", heightCm: 183, weightKg: 72, build: "slim" as const, isDemo, sourceImageUrl: "/x?sig=1", createdAt: "" });

function session(over: Partial<SessionDTO>): SessionDTO {
  return { profile: profile(), generations: [], looks: [], capabilities: REAL, ...over };
}

beforeEach(() => {
  localStorage.clear();
  __resetSessionForTests();
});

describe("studio: real-provider capability is represented honestly", () => {
  it("states that only the suit is applied, and allows generating a ready suit", async () => {
    api.session.mockResolvedValue(session({}));
    render(<Studio />);
    expect(await screen.findByTestId("tryon-scope")).toHaveTextContent("Real try-on applies the suit only. Other selections aren't rendered yet.");
    expect(screen.getByTestId("generate-look")).toHaveTextContent("Generate Look");
    expect(screen.getByTestId("generate-look")).toBeEnabled();
    expect(screen.queryByText(/mock/i)).toBeNull();
  });

  it("blocks suits that have no provider-grade photo", async () => {
    localStorage.setItem("suitlab.studio.v2", JSON.stringify({ currentLook: { suit: "suit-charcoal", shirt: "shirt-crisp-white", tie: "tie-burgundy", shoes: "shoes-black-oxford" } }));
    api.session.mockResolvedValue(session({}));
    render(<Studio />);
    expect(await screen.findByTestId("generate-look")).toHaveTextContent("Not available for this garment");
    expect(screen.getByTestId("generate-look")).toBeDisabled();
  });

  it("explains that the demo model can't be used with real try-on", async () => {
    api.session.mockResolvedValue(session({ profile: profile(true) }));
    render(<Studio />);
    expect(await screen.findByTestId("generate-look")).toHaveTextContent("Needs your own photo");
  });

  it("labels mock output as mock", async () => {
    api.session.mockResolvedValue(
      session({ capabilities: { provider: "mock", realTryOn: false, categories: ["suit", "shirt", "tie", "shoes"], readyGarmentIds: [], demoSupported: true } }),
    );
    render(<Studio />);
    expect(await screen.findByText("Mock preview")).toBeInTheDocument();
    expect(screen.queryByTestId("tryon-scope")).toBeNull();
  });
});
