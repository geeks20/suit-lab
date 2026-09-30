import "server-only";

type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * Minimal structured logger. Only ids, codes and numbers — never image bytes,
 * data URIs, signed URLs or provider keys. Values that look like those are dropped.
 */
export function log(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test") return;
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" && (/^data:|^https?:\/\/|base64|sig=|X-Amz-/i.test(v) || v.length > 300)) continue;
    safe[k] = v;
  }
  console[level](JSON.stringify({ level, event, ...safe }));
}
