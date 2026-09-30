// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { LocalStorage } from "@/server/storage/local";
import { MemoryStorage } from "@/server/storage/memory";
import { R2Storage } from "@/server/storage/r2";
import { assertSafeKey, storageKeys } from "@/server/storage/types";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))));
const tmp = async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), "suitlab-"));
  dirs.push(d);
  return d;
};

describe("storage keys", () => {
  it("scopes user data under users/<id>/", () => {
    expect(storageKeys.profileSource("u1", "p1")).toBe("users/u1/profiles/p1/source.jpg");
    expect(storageKeys.generationOutput("u1", "g1", "png")).toBe("users/u1/generations/g1.png");
  });
  it("rejects traversal and malformed keys", () => {
    for (const bad of ["../etc/passwd", "users/../x", "/abs", "users//x", "users/x/", "a b"]) expect(() => assertSafeKey(bad)).toThrow();
  });
});

describe("LocalStorage (dev) signed access", () => {
  it("round-trips objects and signs expiring URLs", async () => {
    let now = Date.parse("2026-10-01T10:00:00Z");
    const s = new LocalStorage(await tmp(), "secret", () => now);
    await s.put("users/u1/profiles/p1/source.jpg", Buffer.from("img"), "image/jpeg");
    expect((await s.get("users/u1/profiles/p1/source.jpg"))?.contentType).toBe("image/jpeg");

    const url = new URL(await s.signedUrl("users/u1/profiles/p1/source.jpg", 60), "http://x");
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;
    expect(url.pathname).toBe("/api/files/users/u1/profiles/p1/source.jpg");
    expect(s.verify("users/u1/profiles/p1/source.jpg", exp, sig)).toBe(true);
    // Tampering with the key (e.g. another user's id) or signature fails.
    expect(s.verify("users/u2/profiles/p1/source.jpg", exp, sig)).toBe(false);
    expect(s.verify("users/u1/profiles/p1/source.jpg", exp + 1000, sig)).toBe(false);
    // Expired.
    now += 61_000;
    expect(s.verify("users/u1/profiles/p1/source.jpg", exp, sig)).toBe(false);
  });

  it("deletes a user prefix", async () => {
    const s = new LocalStorage(await tmp(), "secret");
    await s.put("users/u1/a.jpg", Buffer.from("1"), "image/jpeg");
    await s.put("users/u1/generations/g.png", Buffer.from("2"), "image/png");
    await s.put("users/u2/a.jpg", Buffer.from("3"), "image/jpeg");
    expect(await s.deletePrefix("users/u1/")).toBe(2);
    expect(await s.get("users/u1/a.jpg")).toBeNull();
    expect(await s.get("users/u2/a.jpg")).not.toBeNull();
  });

  it("refuses dangerous prefixes", async () => {
    const s = new MemoryStorage();
    await expect(s.deletePrefix("users/")).rejects.toThrow();
    await expect(s.deletePrefix("")).rejects.toThrow();
  });
});

describe("R2Storage", () => {
  it("issues presigned, expiring GET URLs for private objects (no public URL)", async () => {
    const r2 = new R2Storage({ endpoint: "https://acct.r2.cloudflarestorage.com", bucket: "suitlab-private", accessKeyId: "AKIDTEST", secretAccessKey: "secret" });
    const url = new URL(await r2.signedUrl("users/u1/generations/g1.png", 600));
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/suitlab-private/users/u1/generations/g1.png");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.href).not.toContain("secret");
  });

  it("puts, gets and deletes by prefix through the S3 API", async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const client = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input });
        if (cmd.constructor.name === "ListObjectsV2Command") return { Contents: [{ Key: "users/u1/a.jpg" }, { Key: "users/u1/b.png" }], IsTruncated: false };
        if (cmd.constructor.name === "GetObjectCommand") return { ContentType: "image/jpeg", Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } };
        return {};
      },
    } as unknown as S3Client;
    const r2 = new R2Storage({ endpoint: "https://x", bucket: "b", accessKeyId: "a", secretAccessKey: "s", client });
    await r2.put("users/u1/a.jpg", Buffer.from([1]), "image/jpeg");
    expect(sent[0]).toMatchObject({ name: "PutObjectCommand", input: { Bucket: "b", Key: "users/u1/a.jpg", ContentType: "image/jpeg" } });
    expect((await r2.get("users/u1/a.jpg"))?.bytes).toEqual(Buffer.from([1, 2]));
    expect(await r2.deletePrefix("users/u1/")).toBe(2);
    expect(sent.at(-1)).toMatchObject({ name: "DeleteObjectsCommand", input: { Delete: { Objects: [{ Key: "users/u1/a.jpg" }, { Key: "users/u1/b.png" }] } } });
    await expect(r2.deletePrefix("users/")).rejects.toThrow();
  });
});
