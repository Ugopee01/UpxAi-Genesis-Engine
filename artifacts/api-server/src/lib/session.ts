import crypto from "crypto";

const SESSION_COOKIE = "upxai_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const SINGLE_USER_ID = "owner";

if (process.env.NODE_ENV === "production" && !process.env.UPXAI_SESSION_SECRET) {
  throw new Error(
    "UPXAI_SESSION_SECRET is required in production to sign session cookies.",
  );
}
if (process.env.NODE_ENV === "production" && !process.env.UPXAI_ADMIN_PASSWORD) {
  throw new Error(
    "UPXAI_ADMIN_PASSWORD is required in production to gate the dashboard.",
  );
}

const SESSION_SECRET =
  process.env.UPXAI_SESSION_SECRET ??
  "upxai-genesis-engine-dev-session-secret-rotate-in-prod";

export const ADMIN_USERNAME = (process.env.UPXAI_ADMIN_USER || "owner").trim();
const ADMIN_PASSWORD =
  process.env.UPXAI_ADMIN_PASSWORD?.trim() || "genesis-engine";

if (process.env.NODE_ENV !== "production") {
  const usingFallbackSecret = !process.env.UPXAI_SESSION_SECRET;
  const usingFallbackPassword = !process.env.UPXAI_ADMIN_PASSWORD;
  const usingFallbackUser = !process.env.UPXAI_ADMIN_USER;
  if (usingFallbackSecret || usingFallbackPassword || usingFallbackUser) {
    const which = [
      usingFallbackUser && "UPXAI_ADMIN_USER",
      usingFallbackPassword && "UPXAI_ADMIN_PASSWORD",
      usingFallbackSecret && "UPXAI_SESSION_SECRET",
    ]
      .filter(Boolean)
      .join(", ");
    console.warn(
      `[upxai-auth] Using DEV FALLBACK auth credentials for: ${which}. ` +
        `Set these environment variables before deploying to production.`,
    );
  }
}

const SECRET_KEY = crypto.createHash("sha256").update(SESSION_SECRET).digest();

export interface SessionUser {
  id: string;
  username: string;
}

interface SessionPayload {
  uid: string;
  un: string;
  iat: number;
  exp: number;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(normalized, "base64");
}

function sign(payloadB64: string): string {
  return b64urlEncode(
    crypto.createHmac("sha256", SECRET_KEY).update(payloadB64).digest(),
  );
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyCredentials(
  username: string,
  password: string,
): SessionUser | null {
  const u = (username || "").trim();
  const p = (password || "").trim();
  if (!u || !p) return null;
  if (
    timingSafeStringEqual(u, ADMIN_USERNAME) &&
    timingSafeStringEqual(p, ADMIN_PASSWORD)
  ) {
    return { id: SINGLE_USER_ID, username: ADMIN_USERNAME };
  }
  return null;
}

export function createSessionToken(user: SessionUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: user.id,
    un: user.username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  if (!timingSafeStringEqual(sig, expected)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.uid !== "string" || typeof payload.un !== "string") return null;
  return { id: payload.uid, username: payload.un };
}

export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
