import type { Request, Response, NextFunction } from "express";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionUser,
} from "../lib/session";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const user = verifySessionToken(token);
  if (user) req.user = user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
