import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { sessionSecret, getConfig } from "./config";
import type { DB } from "./db/client";
import { users } from "./db/schema";

/**
 * Anonymous session: an httpOnly cookie holding "<userId>.<hmac>".
 * No accounts in V0. Every data access is scoped to this user id.
 */
export const SESSION_COOKIE = "sl_sid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(userId: string) {
  return createHmac("sha256", sessionSecret()).update(userId).digest("base64url");
}

export function encodeSession(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(value: string | undefined | null): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig || !UUID_RE.test(id)) return null;
  const a = Buffer.from(sign(id));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function sessionCookieHeader(userId: string | null) {
  const secure = getConfig().isProduction ? "; Secure" : "";
  if (!userId) return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(encodeSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}

/** The session user, if the cookie is valid and the user still exists. */
export async function getSessionUser(db: DB, req: Request): Promise<string | null> {
  const id = decodeSession(readCookie(req, SESSION_COOKIE));
  if (!id) return null;
  const row = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return row[0]?.id ?? null;
}

/** Returns the session user, creating an anonymous one when absent. */
export async function ensureSessionUser(db: DB, req: Request): Promise<{ userId: string; created: boolean }> {
  const existing = await getSessionUser(db, req);
  if (existing) return { userId: existing, created: false };
  const [row] = await db.insert(users).values({}).returning({ id: users.id });
  return { userId: row.id, created: true };
}
