import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tradingRouter from "./trading";
import exchangesRouter from "./exchanges";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

// Public routes (no auth required)
router.use(healthRouter);
router.use(authRouter);

// Everything below requires a valid session cookie.
router.use(requireAuth);
router.use(tradingRouter);
router.use(exchangesRouter);

export default router;
