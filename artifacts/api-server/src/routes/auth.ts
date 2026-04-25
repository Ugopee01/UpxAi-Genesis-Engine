import { Router, type IRouter } from "express";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  verifyCredentials,
} from "../lib/session";
import {
  checkLockout,
  formatRetryAfter,
  getClientKey,
  getSlowdownDelayMs,
  recordFailure,
  recordSuccess,
} from "../lib/login-rate-limit";

const router: IRouter = Router();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post("/auth/login", async (req, res) => {
  const clientKey = getClientKey(req);

  // Verify credentials first. A successful login should never be blocked or
  // delayed by the rate limiter — the lockout exists to stop guessers, not the
  // legitimate owner who eventually types the right password.
  const username = (req.body?.username as string | undefined) ?? "";
  const password = (req.body?.password as string | undefined) ?? "";
  const user = verifyCredentials(username, password);

  if (user) {
    recordSuccess(clientKey);
    const token = createSessionToken(user);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return res.json({ user: { username: user.username } });
  }

  // Failed attempt path. If the IP is already locked, return 429 immediately
  // without adding any slowdown delay — no need to burn server time on it.
  const lockout = checkLockout(clientKey);
  if (lockout.locked) {
    res.setHeader("Retry-After", String(lockout.retryAfterSeconds));
    return res.status(429).json({
      error:
        `Too many failed login attempts. Please wait ${formatRetryAfter(lockout.retryAfterSeconds)} before trying again.`,
      retryAfterSeconds: lockout.retryAfterSeconds,
    });
  }

  // Apply progressive slowdown to throttle automated guessers.
  const slowdownMs = getSlowdownDelayMs(clientKey);
  if (slowdownMs > 0) {
    await delay(slowdownMs);
  }

  const result = recordFailure(clientKey);
  if (result.locked) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    return res.status(429).json({
      error:
        `Too many failed login attempts. Please wait ${formatRetryAfter(result.retryAfterSeconds)} before trying again.`,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return res.status(401).json({
    error: "Invalid username or password",
    attemptsRemaining: result.attemptsRemaining,
  });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(0), maxAge: 0 });
  return res.json({ ok: true });
});

router.get("/auth/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return res.json({ user: { username: req.user.username } });
});

export default router;
