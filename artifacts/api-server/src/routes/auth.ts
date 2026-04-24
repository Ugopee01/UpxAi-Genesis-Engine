import { Router, type IRouter } from "express";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  verifyCredentials,
} from "../lib/session";

const router: IRouter = Router();

router.post("/auth/login", (req, res) => {
  const username = (req.body?.username as string | undefined) ?? "";
  const password = (req.body?.password as string | undefined) ?? "";
  const user = verifyCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = createSessionToken(user);
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res.json({ user: { username: user.username } });
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
