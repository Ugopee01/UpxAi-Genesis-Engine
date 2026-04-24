# UPXAI Genesis Engine

## Overview

**Brand**: UPXAI Genesis Engine — "From zero to first profit — fast, automated, validated."

A crypto trading signal dashboard: fetches BUY/SELL/HOLD signals via RSI analysis, executes simulated trades, and displays live market data (with Binance API fallback simulation).

pnpm workspace monorepo using TypeScript.

## Architecture

The dashboard is served as a **static build** by the API server (Express), since the Vite dev workflow has a port-detection bug in this Replit environment.

- **API server** (`artifacts/api-server`, port 8080): serves both `/api/*` routes AND the built React SPA at `/`
- **React dashboard** (`artifacts/upxai-dashboard`): built with `vite build` → static files served by API server from `dist/public/`
- **Rebuild required**: After UI changes, run `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/upxai-dashboard run build`, then restart the api-server workflow

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API server), Vite (frontend)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/upxai-dashboard run build` — rebuild React dashboard
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifact Routing

- `/` → api-server (port 8080) — serves both API and static React files
- `/__mockup` → mockup-sandbox (port 8081) — canvas component previews

## Trading API Routes

All at `/api/*`:
- `GET /api/signal?symbol=BTCUSDT` — BUY/SELL/HOLD signal with RSI
- `POST /api/trade` — execute simulated trade
- `GET /api/market-data?symbol=BTCUSDT` — live price data
- `GET /api/signals/history?symbol=BTCUSDT` — signal history
- `GET /api/healthz` — health check

Binance API is unreachable from Replit; all routes use realistic simulated fallback data.

## UI Pages

- `/` — Dashboard (live market data, RSI gauge, signal badge, recent signals)
- `/signals` — Signal History (table of past signals)
- `/trade` — Trade Console (execute simulated trades, P&L tracker)
- `/exchanges` — Exchange Connections (Binance / Bybit API key management)

## Authentication

Single-account owner login with a signed httpOnly session cookie (`upxai_session`, 7-day TTL, HMAC-SHA256).

- Env vars (with dev defaults):
  - `UPXAI_ADMIN_USER` (default `owner`)
  - `UPXAI_ADMIN_PASSWORD` (default `genesis-engine`)
  - `UPXAI_SESSION_SECRET` (default dev-only secret — must be set in production)
- Auth routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Protected routes (return 401 without a valid cookie): `/api/exchanges*`, `/api/trade`, `/api/signal`, `/api/signals/history`, `/api/market-data`
- Public routes: `/api/healthz`, `/api/auth/*`
- Exchange-store records are namespaced by `userId`. Legacy flat `data/exchanges.json` is migrated on first read into the default `owner` namespace.
- Frontend gates the whole app behind `AuthProvider` (`src/lib/auth.tsx`); `pages/login.tsx` renders when unauthenticated; header shows current username and a Sign Out button.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
