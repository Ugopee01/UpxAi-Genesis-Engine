import { Router, type IRouter } from "express";
import axios from "axios";
import { listSummaries } from "../lib/exchange-store";

const router: IRouter = Router();

const SYMBOL_BASE_PRICES: Record<string, number> = {
  BTCUSDT: 94500,
  ETHUSDT: 3650,
  SOLUSDT: 185,
  BNBUSDT: 715,
  XRPUSDT: 2.28,
  ADAUSDT: 0.88,
};

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

function seedHistory() {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BTCUSDT", "BTCUSDT"];
  const now = Date.now();
  const entries: Array<{ signal: "BUY" | "SELL" | "HOLD"; symbol: string; rsi: number; price: number; timestamp: string }> = [];

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

const signalHistory: Array<{
  signal: "BUY" | "SELL" | "HOLD";
  symbol: string;
  rsi: number;
  price: number;
  timestamp: string;
}> = seedHistory();

router.get("/signal", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";
  const result = await computeSignal(symbol);
  const entry = { signal: result.signal, symbol: result.symbol, rsi: result.rsi, price: result.price, timestamp: result.timestamp };
  signalHistory.unshift(entry);
  if (signalHistory.length > 100) signalHistory.pop();
  res.json(entry);
});

router.post("/trade", async (req, res) => {
  const symbol = (req.body?.symbol as string) || "BTCUSDT";
  const liveMode = req.body?.liveMode === true;
  const result = await computeSignal(symbol);
  const executed = { signal: result.signal, symbol: result.symbol, rsi: result.rsi, price: result.price, timestamp: result.timestamp };
  signalHistory.unshift(executed);
  if (signalHistory.length > 100) signalHistory.pop();

  // When live mode is armed, log which connected exchange would have
  // received the order. Order routing remains simulated by design in
  // this iteration — see follow-up "Actually route live trades to the
  // connected exchange".
  let targetExchange: string | undefined;
  if (liveMode) {
    const connected = listSummaries();
    // Prefer an exchange that has passed its test, otherwise fall back to any connected one.
    targetExchange =
      connected.find((s) => s.lastTestStatus === "ok")?.exchange ?? connected[0]?.exchange;
    if (targetExchange) {
      console.log(
        `[trade] LIVE armed — would route ${executed.signal} ${executed.symbol} @ ${executed.price} to ${targetExchange} (simulated)`,
      );
    } else {
      console.log(
        `[trade] LIVE armed but no exchange connected — falling back to simulation for ${executed.signal} ${executed.symbol}`,
      );
    }
  }

  res.json({ executed, simulated: !liveMode, liveMode, targetExchange });
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
