import type { Request } from "express";

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const SLOWDOWN_AFTER_ATTEMPTS = 3;
export const SLOWDOWN_BASE_MS = 500;
export const SLOWDOWN_MAX_MS = 4000;

interface AttemptRecord {
  failedAttempts: number;
  firstFailedAt: number;
  lastFailedAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

function now(): number {
  return Date.now();
}

export function getClientKey(req: Request): string {
  // Rely on Express's `req.ip`, which only honors X-Forwarded-For when the
  // immediate connection came from a trusted proxy hop (configured via
  // `app.set("trust proxy", ...)`). Reading the header directly would let an
  // attacker spoof a fresh IP per request and bypass the lockout entirely.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export interface LockoutStatus {
  locked: boolean;
  retryAfterSeconds: number;
}

export function checkLockout(key: string): LockoutStatus {
  const rec = attempts.get(key);
  if (!rec) return { locked: false, retryAfterSeconds: 0 };
  const t = now();
  if (rec.lockedUntil > t) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((rec.lockedUntil - t) / 1000),
    };
  }
  if (rec.lockedUntil > 0 && rec.lockedUntil <= t) {
    attempts.delete(key);
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export function getSlowdownDelayMs(key: string): number {
  const rec = attempts.get(key);
  if (!rec) return 0;
  if (rec.failedAttempts < SLOWDOWN_AFTER_ATTEMPTS) return 0;
  const over = rec.failedAttempts - SLOWDOWN_AFTER_ATTEMPTS + 1;
  const delay = SLOWDOWN_BASE_MS * Math.pow(2, over - 1);
  return Math.min(delay, SLOWDOWN_MAX_MS);
}

export interface FailureResult {
  locked: boolean;
  retryAfterSeconds: number;
  failedAttempts: number;
  attemptsRemaining: number;
}

export function recordFailure(key: string): FailureResult {
  const t = now();
  let rec = attempts.get(key);
  if (!rec || t - rec.firstFailedAt > ATTEMPT_WINDOW_MS) {
    rec = {
      failedAttempts: 0,
      firstFailedAt: t,
      lastFailedAt: t,
      lockedUntil: 0,
    };
  }
  rec.failedAttempts += 1;
  rec.lastFailedAt = t;
  if (rec.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    rec.lockedUntil = t + LOCKOUT_MS;
  }
  attempts.set(key, rec);
  return {
    locked: rec.lockedUntil > t,
    retryAfterSeconds:
      rec.lockedUntil > t ? Math.ceil((rec.lockedUntil - t) / 1000) : 0,
    failedAttempts: rec.failedAttempts,
    attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - rec.failedAttempts),
  };
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}

export function formatRetryAfter(seconds: number): string {
  if (seconds <= 0) return "a moment";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function _resetForTests(): void {
  attempts.clear();
}
