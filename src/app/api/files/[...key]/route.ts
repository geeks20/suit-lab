import { getStorage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";

/**
 * Serves LOCAL storage objects behind HMAC-signed, expiring URLs (dev/e2e only).
 * With R2, clients get presigned R2 URLs instead and this route returns 404.
 */
export async function GET(req: Request, arg: RouteContext<"/api/files/[...key]">) {
  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) return new Response("Not found", { status: 404 });
  const { key: parts } = await arg.params;
  const key = parts.join("/");
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  let valid = false;
  try {
    valid = storage.verify(key, exp, sig);
  } catch {}
  if (!valid) return new Response("Forbidden", { status: 403 });
  const obj = await storage.get(key).catch(() => null);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": `private, max-age=${Math.max(0, Math.min(3600, exp - Math.floor(Date.now() / 1000)))}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
