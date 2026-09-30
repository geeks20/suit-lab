"use client";

import type { ApiErrorBody, GenerationDTO, LookDTO, ProfileDTO, SessionDTO } from "@/lib/api-types";
import type { LookSelection } from "@/domain/look";
import type { ProfileDetails } from "@/domain/profile";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const FALLBACK = "Suit Lab is having trouble right now. Please try again.";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("network", 0, FALLBACK);
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) throw new ApiError(body?.error?.code ?? "http", res.status, body?.error?.message ?? FALLBACK);
  return body as T;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  session: () => call<SessionDTO>("/api/session", { cache: "no-store" }),
  createProfile: (photo: Blob, details: ProfileDetails) => {
    const form = new FormData();
    form.set("photo", photo, "photo.jpg");
    form.set("heightCm", String(details.heightCm));
    form.set("weightKg", String(details.weightKg));
    form.set("build", details.build);
    return call<{ profile: ProfileDTO }>("/api/profile", { method: "POST", body: form });
  },
  createDemoProfile: () => call<{ profile: ProfileDTO }>("/api/profile/demo", jsonInit("POST", {})),
  startGeneration: (profileId: string, selection: LookSelection) =>
    call<{ generation: GenerationDTO }>("/api/generations", jsonInit("POST", { profileId, selection })),
  getGeneration: (id: string) => call<{ generation: GenerationDTO }>(`/api/generations/${id}`, { cache: "no-store" }),
  saveLook: (generationId: string) => call<{ look: LookDTO; alreadySaved: boolean }>("/api/looks", jsonInit("POST", { generationId })),
  renameLook: (id: string, name: string) => call<{ look: LookDTO }>(`/api/looks/${id}`, jsonInit("PATCH", { name })),
  deleteLook: (id: string) => call<{ ok: true }>(`/api/looks/${id}`, jsonInit("DELETE")),
  deleteMe: () => call<{ ok: true }>("/api/me", jsonInit("DELETE")),
};

/** Turns the browser-prepared data URL back into a Blob for upload. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
