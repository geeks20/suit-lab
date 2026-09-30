import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Unmount rendered components between tests (no vitest globals, so RTL can't register this itself).
afterEach(async () => {
  if (typeof document !== "undefined") (await import("@testing-library/react")).cleanup();
});

// Node 25 exposes an experimental global localStorage that shadows jsdom's; use a plain in-memory one.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}
for (const target of [globalThis, typeof window !== "undefined" ? window : globalThis]) {
  Object.defineProperty(target, "localStorage", { value: new MemoryStorage(), configurable: true });
}

// Hard guard: no test may reach a paid provider. Any real call to FASHN fails loudly.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/fashn\.ai/i.test(url)) throw new Error(`BLOCKED: test attempted a real FASHN call to ${url}`);
  return realFetch(input, init);
}) as typeof fetch;
