import "@testing-library/jest-dom/vitest";

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
for (const target of [globalThis, window]) {
  Object.defineProperty(target, "localStorage", { value: new MemoryStorage(), configurable: true });
}
