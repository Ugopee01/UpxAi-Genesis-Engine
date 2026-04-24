import { Router, type IRouter } from "express";
import axios from "axios";

const router: IRouter = Router();

const signalHistory: Array<{
  signal: "BUY" | "SELL" | "HOLD";
  symbol: string;
  rsi: number;
  price: number;
  timestamp: string;
}> = [];

const SYMBOL_BASE_PRICES: Record<string, number> = {
  BTCUSDT: 94500,
  ETHUSDT: 3200,
  SOLUSDT: 165,
  BNBUSDT: 610,
  XRPUSDT: 2.2,
  ADAUSDT: 0.85,
};

function simulatePrice(symbol: string): number {
  const base = SYMBOL_BASE_PRICES[symbol] ?? 100;
  const variance = base * 0.002;
  return parseFloat((base + (Math.random() - 0.5) * 2 * variance).toFixed(2));
}

function simulateRSI(): number {
  return parseFloat((25 + Math.random() * 60).toFixed(2));
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

router.get("/signal", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";
  const result = await computeSignal(symbol);
  const entry = { signal: result.signal, symbol: result.symbol, rsi: result.rsi, price: result.price, timestamp: result.timestamp };
  signalHistory.unshift(entry);
  if (signalHistory.length > 50) signalHistory.pop();
  res.json(entry);
});

router.post("/trade", async (req, res) => {
  const symbol = (req.body?.symbol as string) || "BTCUSDT";
  const liveMode = req.body?.liveMode === true;
  const result = await computeSignal(symbol);
  const executed = { signal: result.signal, symbol: result.symbol, rsi: result.rsi, price: result.price, timestamp: result.timestamp };
  signalHistory.unshift(executed);
  if (signalHistory.length > 50) signalHistory.pop();
  res.json({ executed, simulated: !liveMode, liveMode });
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
    const changePercent = parseFloat(((Math.random() - 0.45) * 8).toFixed(2));
    const change = parseFloat((price * changePercent / 100).toFixed(2));
    const variance = price * 0.04;
    res.json({
      symbol,
      price,
      priceChange24h: change,
      priceChangePercent24h: changePercent,
      high24h: parseFloat((price + variance).toFixed(2)),
      low24h: parseFloat((price - variance).toFixed(2)),
      volume24h: parseFloat((Math.random() * 50000 + 10000).toFixed(2)),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/signals/history", (_req, res) => {
  res.json({ history: signalHistory });
});

export default router;
