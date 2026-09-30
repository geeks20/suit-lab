// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests } from "@/server/db/client";
import { setStorageForTests } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { setProviderForTests } from "@/server/tryon";
import { MockTryOnProvider } from "@/lib/tryon";
import { SESSION_COOKIE, encodeSession } from "@/server/session";
import { POST as createDemo } from "@/app/api/profile/demo/route";
import { POST as createProfileRoute } from "@/app/api/profile/route";
import { POST as startGeneration } from "@/app/api/generations/route";
import { GET as getGeneration } from "@/app/api/generations/[id]/route";
import { GET as getFile } from "@/app/api/files/[...key]/route";
import { DELETE as deleteMe } from "@/app/api/me/route";
import { GET as getSessionRoute } from "@/app/api/session/route";
import { DEFAULT_LOOK } from "@/domain/look";
import { makeDb, photo } from "./helpers";

let dir: string;
let storage: LocalStorage;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "suitlab-routes-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  setDbForTests(null);
  setStorageForTests(null);
  setProviderForTests(null);
});
beforeEach(async () => {
  setDbForTests(await makeDb());
  storage = new LocalStorage(dir, "suitlab-dev-only-secret-do-not-use-in-production");
  setStorageForTests(storage);
  setProviderForTests(new MockTryOnProvider({ latencyMs: 0 }));
});

const BASE = "http://localhost:3000";
const cookieFrom = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];
const params = <T>(p: T) => ({ params: Promise.resolve(p) }) as never;

async function newUserWithPhoto() {
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(await photo())], { type: "image/jpeg" }), "me.jpg");
  form.set("heightCm", "183");
  form.set("weightKg", "72");
  form.set("build", "slim");
  const res = await createProfileRoute(new Request(`${BASE}/api/profile`, { method: "POST", body: form }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return { cookie: cookieFrom(res), profile: body.profile };
}

describe("API routes", () => {
  it("sets an httpOnly session cookie and returns a signed photo URL", async () => {
    const form = new FormData();
    form.set("photo", new Blob([new Uint8Array(await photo())], { type: "image/jpeg" }), "me.jpg");
    form.set("heightCm", "183");
    form.set("weightKg", "72");
    form.set("build", "slim");
    const res = await createProfileRoute(new Request(`${BASE}/api/profile`, { method: "POST", body: form }));
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/);
    expect((await res.json()).profile.sourceImageUrl).toMatch(/^\/api\/files\/users\/.+\/source\.jpg\?exp=\d+&sig=/);
  });

  it("rejects a bad upload with a friendly message", async () => {
    const form = new FormData();
    form.set("photo", new Blob(["not an image"], { type: "image/jpeg" }), "x.jpg");
    form.set("heightCm", "183");
    form.set("weightKg", "72");
    form.set("build", "slim");
    const res = await createProfileRoute(new Request(`${BASE}/api/profile`, { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("We couldn't use this photo. Try a clearer image with your face visible.");
  });

  it("serves private files only with a valid signature", async () => {
    const { profile } = await newUserWithPhoto();
    const ok = await getFile(new Request(`${BASE}${profile.sourceImageUrl}`), params({ key: profile.sourceImageUrl.split("?")[0].replace("/api/files/", "").split("/") }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(ok.headers.get("cache-control")).toMatch(/^private/);

    const unsigned = profile.sourceImageUrl.split("?")[0];
    const bad = await getFile(new Request(`${BASE}${unsigned}?exp=9999999999&sig=forged`), params({ key: unsigned.replace("/api/files/", "").split("/") }));
    expect(bad.status).toBe(403);
  });

  it("does not let one user read another user's generation by id (IDOR)", async () => {
    const alice = await newUserWithPhoto();
    const start = await startGeneration(
      new Request(`${BASE}/api/generations`, { method: "POST", headers: { cookie: alice.cookie, "content-type": "application/json" }, body: JSON.stringify({ profileId: alice.profile.id, selection: DEFAULT_LOOK }) }),
    );
    expect(start.status).toBe(202);
    const { generation } = await start.json();

    const mallory = await newUserWithPhoto();
    const peek = await getGeneration(new Request(`${BASE}/api/generations/${generation.id}`, { headers: { cookie: mallory.cookie } }), params({ id: generation.id }));
    expect(peek.status).toBe(404);
    const anon = await getGeneration(new Request(`${BASE}/api/generations/${generation.id}`), params({ id: generation.id }));
    expect(anon.status).toBe(404);

    const mine = await getGeneration(new Request(`${BASE}/api/generations/${generation.id}`, { headers: { cookie: alice.cookie } }), params({ id: generation.id }));
    expect(mine.status).toBe(200);
  });

  it("rejects forged session cookies and cross-site mutations", async () => {
    const forged = `${SESSION_COOKIE}=${encodeURIComponent("00000000-0000-4000-8000-000000000000.forged")}`;
    const s = await getSessionRoute(new Request(`${BASE}/api/session`, { headers: { cookie: forged } }));
    expect((await s.json()).profile).toBeNull();

    const csrf = await createDemo(new Request(`${BASE}/api/profile/demo`, { method: "POST", headers: { origin: "https://evil.example.com", host: "localhost:3000" } }));
    expect(csrf.status).toBe(403);
    expect(encodeSession("00000000-0000-4000-8000-000000000000")).not.toContain("forged");
  });

  it("DELETE /api/me removes files and data and clears the cookie", async () => {
    const { cookie, profile } = await newUserWithPhoto();
    const res = await deleteMe(new Request(`${BASE}/api/me`, { method: "DELETE", headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    const key = profile.sourceImageUrl.split("?")[0].replace("/api/files/", "");
    expect(await storage.get(key)).toBeNull();
    const after = await getSessionRoute(new Request(`${BASE}/api/session`, { headers: { cookie } }));
    expect((await after.json()).profile).toBeNull();
  });
});
