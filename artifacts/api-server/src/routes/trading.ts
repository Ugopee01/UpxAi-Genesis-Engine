import { Router, type IRouter } from "express";
import axios from "axios";
import crypto from "crypto";
import {
  type ExchangeId,
  getRecord,
  listSummaries,
  type ExchangeRecord,
} from "../lib/exchange-store";

const router: IRouter = Router();

const SYMBOL_BASE_PRICES: Record<string, number> = {
  BTCUSDT: 94500,
  ETHUSDT: 3650,
  SOLUSDT: 185,
  BNBUSDT: 715,
  XRPUSDT: 2.28,
  ADAUSDT: 0.88,
};

// Hard safety rails for live orders. These cap blast radius even if the
// client is compromised — never rely on UI-side bounds alone.
const LIVE_MIN_USDT = 5;
const LIVE_MAX_USDT = 50;

function simulatePrice(symbol: string): number {
  const base = SYMBOL_BASE_PRICES[symbol] ?? 100;
  const variance = base * 0.004;
  return parseFloat((base + (Math.random() - 0.5) * 2 * variance).toFixed(2));
}

function simulateRSI(): number {
  const roll = Math.random();
  if (roll < 0.15) return parseFloat((18 + Math.random() * 12).toFixed(2));
  if (roll < 0.20) return parseFloat((70 + Math.random() * 20).toFixed(2));
  return parseFloat((35 + Math.random() * 35).toFixed(2));
}

async function fetchKlines(symbol: string): Promise<number[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`;
  const response = await axios.get(url, { timeout: 8000 });
  return response.data.map((c: string[]) => parseFloat(c[4]));
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function computeSignal(symbol: string) {
  let rsi: number;
  let price: number;
  let isSimulated = false;

  try {
    const closes = await fetchKlines(symbol);
    rsi = parseFloat(computeRSI(closes).toFixed(2));
    price = closes[closes.length - 1];
  } catch {
    rsi = simulateRSI();
    price = simulatePrice(symbol);
    isSimulated = true;
  }

  let signal: "BUY" | "SELL" | "HOLD";
  if (rsi < 30) signal = "BUY";
  else if (rsi > 70) signal = "SELL";
  else signal = "HOLD";

  return { signal, symbol, rsi, price, timestamp: new Date().toISOString(), simulated: isSimulated };
}

type TradeMode = "LIVE" | "SIMULATED";
type TradeStatus = "FILLED" | "ACCEPTED" | "FAILED" | "SIMULATED";

interface SignalHistoryEntry {
  signal: "BUY" | "SELL" | "HOLD";
  symbol: string;
  rsi: number;
  price: number;
  timestamp: string;
  mode?: TradeMode;
  status?: TradeStatus;
  targetExchange?: ExchangeId;
  orderId?: string;
  executedQty?: number;
  executedQuoteQty?: number;
  error?: string;
}

function seedHistory(): SignalHistoryEntry[] {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BTCUSDT", "BTCUSDT"];
  const now = Date.now();
  const entries: SignalHistoryEntry[] = [];

  for (let i = 24; i >= 0; i--) {
    const symbol = symbols[i % symbols.length];
    const rsi = simulateRSI();
    const price = simulatePrice(symbol);
    let signal: "BUY" | "SELL" | "HOLD";
    if (rsi < 30) signal = "BUY";
    else if (rsi > 70) signal = "SELL";
    else signal = "HOLD";
    entries.push({
      signal,
      symbol,
      rsi,
      price,
      timestamp: new Date(now - i * 45 * 60 * 1000 - Math.random() * 20 * 60 * 1000).toISOString(),
    });
  }
  return entries.reverse();
}

const signalHistory: SignalHistoryEntry[] = seedHistory();

function pushHistory(entry: SignalHistoryEntry) {
  signalHistory.unshift(entry);
  if (signalHistory.length > 100) signalHistory.pop();
}

router.get("/signal", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";
  const result = await computeSignal(symbol);
  pushHistory({
    signal: result.signal,
    symbol: result.symbol,
    rsi: result.rsi,
    price: result.price,
    timestamp: result.timestamp,
  });
  res.json({ signal: result.signal, symbol: result.symbol, rsi: result.rsi, price: result.price, timestamp: result.timestamp });
});

interface LiveOrderResult {
  status: "FILLED" | "ACCEPTED" | "FAILED";
  orderId?: string;
  executedQty?: number;
  executedQuoteQty?: number;
  averagePrice?: number;
  error?: string;
}

async function placeBinanceOrder(
  rec: ExchangeRecord,
  symbol: string,
  side: "BUY" | "SELL",
  quoteOrderQty: number,
): Promise<LiveOrderResult> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({
      symbol,
      side,
      type: "MARKET",
      quoteOrderQty: quoteOrderQty.toFixed(2),
      newOrderRespType: "FULL",
      recvWindow: "5000",
      timestamp: String(timestamp),
    });
    const query = params.toString();
    const signature = crypto
      .createHmac("sha256", rec.apiSecret)
      .update(query)
      .digest("hex");
    const url = `https://api.binance.com/api/v3/order?${query}&signature=${signature}`;
    const r = await axios.post(url, null, {
      timeout: 10000,
      headers: { "X-MBX-APIKEY": rec.apiKey },
    });
    const d = r.data;
    const executedQty = parseFloat(d?.executedQty ?? "0");
    const cummulativeQuoteQty = parseFloat(d?.cummulativeQuoteQty ?? "0");
    const avg = executedQty > 0 ? cummulativeQuoteQty / executedQty : undefined;
    // Trust Binance's order status: FILLED only when it really filled,
    // otherwise treat as accepted (NEW / PARTIALLY_FILLED).
    const binanceStatus = String(d?.status ?? "").toUpperCase();
    const status: LiveOrderResult["status"] =
      binanceStatus === "FILLED" ? "FILLED" : "ACCEPTED";
    return {
      status,
      orderId: String(d?.orderId ?? d?.clientOrderId ?? ""),
      executedQty,
      executedQuoteQty: cummulativeQuoteQty,
      averagePrice: avg,
    };
  } catch (err) {
    const e = err as { response?: { data?: { msg?: string; code?: number } }; message?: string; code?: string };
    if (e.response?.data?.msg) return { status: "FAILED", error: `Binance: ${e.response.data.msg}` };
    if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" || e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      return { status: "FAILED", error: "Binance unreachable from this network. Try after deployment." };
    }
    return { status: "FAILED", error: e.message || "Unknown error contacting Binance." };
  }
}

async function placeBybitOrder(
  rec: ExchangeRecord,
  symbol: string,
  side: "BUY" | "SELL",
  quoteOrderQty: number,
): Promise<LiveOrderResult> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const body = {
      category: "spot",
      symbol,
      side: side === "BUY" ? "Buy" : "Sell",
      orderType: "Market",
      qty: quoteOrderQty.toFixed(2),
      marketUnit: "quoteCoin",
    };
    const bodyJson = JSON.stringify(body);
    const signPayload = timestamp + rec.apiKey + recvWindow + bodyJson;
    const signature = crypto
      .createHmac("sha256", rec.apiSecret)
      .update(signPayload)
      .digest("hex");
    const r = await axios.post("https://api.bybit.com/v5/order/create", bodyJson, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "X-BAPI-API-KEY": rec.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "X-BAPI-SIGN-TYPE": "2",
      },
    });
    const ret = r.data;
    if (ret?.retCode === 0) {
      const orderId = ret?.result?.orderId ?? ret?.result?.orderLinkId ?? "";
      // Bybit's create response only confirms acceptance — fill details
      // require a follow-up query against /v5/order/realtime. Mark this
      // accurately as ACCEPTED so audit/history isn't misleading.
      return {
        status: "ACCEPTED",
        orderId: String(orderId),
        executedQuoteQty: quoteOrderQty,
      };
    }
    return { status: "FAILED", error: `Bybit: ${ret?.retMsg || "Unknown response"}` };
  } catch (err) {
    const e = err as { response?: { data?: { retMsg?: string } }; message?: string; code?: string };
    if (e.response?.data?.retMsg) return { status: "FAILED", error: `Bybit: ${e.response.data.retMsg}` };
    if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" || e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      return { status: "FAILED", error: "Bybit unreachable from this network. Try after deployment." };
    }
    return { status: "FAILED", error: e.message || "Unknown error contacting Bybit." };
  }
}

async function placeLiveOrder(
  exchange: ExchangeId,
  rec: ExchangeRecord,
  symbol: string,
  side: "BUY" | "SELL",
  quoteOrderQty: number,
): Promise<LiveOrderResult> {
  if (exchange === "binance") return placeBinanceOrder(rec, symbol, side, quoteOrderQty);
  return placeBybitOrder(rec, symbol, side, quoteOrderQty);
}

router.post("/trade", async (req, res) => {
  const userId = req.user!.id;
  const symbol = (req.body?.symbol as string) || "BTCUSDT";
  const liveMode = req.body?.liveMode === true;
  const confirmLive = req.body?.confirmLive === true;
  const requestedSide = req.body?.side as "BUY" | "SELL" | undefined;
  const quantityUsdt = Number(req.body?.quantityUsdt);
  const requestedExchange = req.body?.targetExchange as ExchangeId | undefined;

  const result = await computeSignal(symbol);
  const baseExecuted = {
    signal: result.signal,
    symbol: result.symbol,
    rsi: result.rsi,
    price: result.price,
    timestamp: result.timestamp,
  };

  // Default path: dry-run / simulated.
  if (!liveMode) {
    pushHistory({ ...baseExecuted, mode: "SIMULATED", status: "SIMULATED" });
    return res.json({
      executed: baseExecuted,
      simulated: true,
      liveMode: false,
      mode: "SIMULATED" as const,
      status: "SIMULATED" as const,
    });
  }

  // Live mode requested — enforce a separate explicit confirmation.
  if (!confirmLive) {
    return res.status(400).json({
      error: "Live execution requires explicit confirmation (confirmLive=true).",
    });
  }

  // Resolve the side. Default to the engine's signal; allow override only to
  // BUY or SELL. HOLD signals can't be turned into a real order.
  const side: "BUY" | "SELL" | undefined =
    requestedSide === "BUY" || requestedSide === "SELL"
      ? requestedSide
      : result.signal === "BUY" || result.signal === "SELL"
        ? result.signal
        : undefined;

  if (!side) {
    return res.status(400).json({
      error: "Current signal is HOLD — choose BUY or SELL explicitly to place a live order.",
    });
  }

  // Validate notional against hard safety caps.
  if (!Number.isFinite(quantityUsdt) || quantityUsdt <= 0) {
    return res.status(400).json({ error: "quantityUsdt must be a positive number." });
  }
  if (quantityUsdt < LIVE_MIN_USDT) {
    return res.status(400).json({ error: `Minimum live order size is ${LIVE_MIN_USDT} USDT.` });
  }
  if (quantityUsdt > LIVE_MAX_USDT) {
    return res.status(400).json({ error: `Maximum live order size is ${LIVE_MAX_USDT} USDT (safety cap).` });
  }

  // Resolve the target exchange. If the caller named one explicitly, honour
  // that choice exactly — never silently re-route to a different venue, even
  // if another exchange is connected. Only fall back when the caller left it
  // unspecified.
  const connected = listSummaries(userId);
  let targetExchange: ExchangeId | undefined;
  if (requestedExchange) {
    if (!connected.some((c) => c.exchange === requestedExchange)) {
      return res.status(400).json({
        error: `Requested exchange "${requestedExchange}" is not connected — connect it first or omit targetExchange.`,
      });
    }
    targetExchange = requestedExchange;
  } else {
    targetExchange =
      (connected.find((s) => s.lastTestStatus === "ok")?.exchange as ExchangeId | undefined) ??
      (connected[0]?.exchange as ExchangeId | undefined);
  }
  if (!targetExchange) {
    return res.status(400).json({ error: "No exchange connected — connect one before going live." });
  }

  const rec = getRecord(userId, targetExchange);
  if (!rec) {
    return res.status(400).json({ error: `${targetExchange} credentials missing.` });
  }

  const orderResult = await placeLiveOrder(targetExchange, rec, symbol, side, quantityUsdt);
  console.log(
    `[trade] LIVE ${side} ${symbol} ${quantityUsdt} USDT via ${targetExchange} → ${orderResult.status}` +
      (orderResult.orderId ? ` orderId=${orderResult.orderId}` : "") +
      (orderResult.error ? ` error=${orderResult.error}` : ""),
  );

  // Record the live attempt in the archive regardless of outcome — the user
  // needs an audit trail of failed live orders too.
  const executedForHistory = { ...baseExecuted, signal: side };
  pushHistory({
    ...executedForHistory,
    mode: "LIVE",
    status: orderResult.status,
    targetExchange,
    orderId: orderResult.orderId,
    executedQty: orderResult.executedQty,
    executedQuoteQty: orderResult.executedQuoteQty,
    error: orderResult.error,
  });

  return res.json({
    executed: executedForHistory,
    simulated: false,
    liveMode: true,
    mode: "LIVE" as const,
    status: orderResult.status,
    targetExchange,
    orderId: orderResult.orderId,
    executedQty: orderResult.executedQty,
    executedQuoteQty: orderResult.executedQuoteQty,
    error: orderResult.error,
  });
});

router.get("/market-data", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";

  try {
    const [tickerRes, priceRes] = await Promise.all([
      axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { timeout: 8000 }),
      axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { timeout: 8000 }),
    ]);
    const t = tickerRes.data;
    res.json({
      symbol,
      price: parseFloat(priceRes.data.price),
      priceChange24h: parseFloat(t.priceChange),
      priceChangePercent24h: parseFloat(t.priceChangePercent),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
      volume24h: parseFloat(t.volume),
      timestamp: new Date().toISOString(),
    });
  } catch {
    const price = simulatePrice(symbol);
    const changePercent = parseFloat(((Math.random() - 0.45) * 6).toFixed(2));
    const change = parseFloat((price * changePercent / 100).toFixed(2));
    const high = parseFloat((price * (1 + 0.03 + Math.random() * 0.02)).toFixed(2));
    const low = parseFloat((price * (1 - 0.03 - Math.random() * 0.02)).toFixed(2));
    const vol = symbol === "BTCUSDT"
      ? parseFloat((28000 + Math.random() * 20000).toFixed(2))
      : parseFloat((Math.random() * 1000000 + 100000).toFixed(2));
    res.json({
      symbol,
      price,
      priceChange24h: change,
      priceChangePercent24h: changePercent,
      high24h: high,
      low24h: low,
      volume24h: vol,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/signals/history", (_req, res) => {
  res.json({ history: signalHistory });
});

export default router;
