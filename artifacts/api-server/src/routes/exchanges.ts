import { Router, type IRouter } from "express";
import axios from "axios";
import crypto from "crypto";
import {
  type ExchangeId,
  getRecord,
  setRecord,
  deleteRecord,
  listSummaries,
  maskKey,
  updateTestResult,
  type ExchangeRecord,
} from "../lib/exchange-store";

const router: IRouter = Router();

const EXCHANGE_NAMES: Record<ExchangeId, string> = {
  binance: "Binance",
  bybit: "Bybit",
};

const SUPPORTED: ExchangeId[] = ["binance", "bybit"];

function isExchangeId(v: string): v is ExchangeId {
  return (SUPPORTED as string[]).includes(v);
}

function toStatus(exchange: ExchangeId, rec?: Omit<ExchangeRecord, "apiSecret">) {
  if (!rec) {
    return {
      exchange,
      name: EXCHANGE_NAMES[exchange],
      configured: false,
      lastTestStatus: "untested" as const,
    };
  }
  return {
    exchange,
    name: EXCHANGE_NAMES[exchange],
    configured: true,
    apiKeyMasked: maskKey(rec.apiKey),
    lastTestedAt: rec.lastTestedAt,
    lastTestStatus: rec.lastTestStatus,
    lastTestMessage: rec.lastTestMessage,
  };
}

router.get("/exchanges", (req, res) => {
  const userId = req.user!.id;
  const summaries = listSummaries(userId);
  const map = new Map(summaries.map((s) => [s.exchange, s]));
  const exchanges = SUPPORTED.map((id) => toStatus(id, map.get(id)));
  const connectedCount = exchanges.filter((e) => e.configured).length;
  res.json({ exchanges, connectedCount });
});

router.post("/exchanges/:exchange/connect", (req, res) => {
  const userId = req.user!.id;
  const exchange = req.params.exchange;
  if (!isExchangeId(exchange)) {
    return res.status(400).json({ error: "Unsupported exchange" });
  }
  const apiKey = (req.body?.apiKey as string | undefined)?.trim() ?? "";
  const apiSecret = (req.body?.apiSecret as string | undefined)?.trim() ?? "";
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: "apiKey and apiSecret are required" });
  }
  if (apiKey.length < 8 || apiSecret.length < 8) {
    return res.status(400).json({ error: "apiKey and apiSecret look too short" });
  }
  const saved = setRecord(userId, {
    exchange,
    apiKey,
    apiSecret,
    lastTestStatus: "untested",
  });
  return res.json(toStatus(exchange, saved));
});

router.post("/exchanges/:exchange/disconnect", (req, res) => {
  const userId = req.user!.id;
  const exchange = req.params.exchange;
  if (!isExchangeId(exchange)) {
    return res.status(400).json({ error: "Unsupported exchange" });
  }
  deleteRecord(userId, exchange);
  return res.json(toStatus(exchange, undefined));
});

async function testBinance(rec: ExchangeRecord): Promise<{ success: boolean; message: string }> {
  try {
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}&recvWindow=5000`;
    const signature = crypto
      .createHmac("sha256", rec.apiSecret)
      .update(query)
      .digest("hex");
    const url = `https://api.binance.com/api/v3/account?${query}&signature=${signature}`;
    const r = await axios.get(url, {
      timeout: 8000,
      headers: { "X-MBX-APIKEY": rec.apiKey },
    });
    const balances = Array.isArray(r.data?.balances) ? r.data.balances.length : 0;
    return { success: true, message: `Authenticated — ${balances} balances visible.` };
  } catch (err) {
    const e = err as { response?: { data?: { msg?: string; code?: number } }; message?: string; code?: string };
    if (e.response?.data?.msg) {
      return { success: false, message: `Binance: ${e.response.data.msg}` };
    }
    if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" || e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      return { success: false, message: "Binance unreachable from this network. Try after deployment." };
    }
    return { success: false, message: e.message || "Unknown error contacting Binance." };
  }
}

async function testBybit(rec: ExchangeRecord): Promise<{ success: boolean; message: string }> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const queryString = "accountType=UNIFIED";
    const signPayload = timestamp + rec.apiKey + recvWindow + queryString;
    const signature = crypto
      .createHmac("sha256", rec.apiSecret)
      .update(signPayload)
      .digest("hex");
    const url = `https://api.bybit.com/v5/account/wallet-balance?${queryString}`;
    const r = await axios.get(url, {
      timeout: 8000,
      headers: {
        "X-BAPI-API-KEY": rec.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "X-BAPI-SIGN-TYPE": "2",
      },
    });
    const ret = r.data;
    if (ret?.retCode === 0) {
      const accounts = Array.isArray(ret.result?.list) ? ret.result.list.length : 0;
      return { success: true, message: `Authenticated — ${accounts} account(s) visible.` };
    }
    return { success: false, message: `Bybit: ${ret?.retMsg || "Unknown response"}` };
  } catch (err) {
    const e = err as { response?: { data?: { retMsg?: string } }; message?: string; code?: string };
    if (e.response?.data?.retMsg) {
      return { success: false, message: `Bybit: ${e.response.data.retMsg}` };
    }
    if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" || e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      return { success: false, message: "Bybit unreachable from this network. Try after deployment." };
    }
    return { success: false, message: e.message || "Unknown error contacting Bybit." };
  }
}

router.post("/exchanges/:exchange/test", async (req, res) => {
  const userId = req.user!.id;
  const exchange = req.params.exchange;
  if (!isExchangeId(exchange)) {
    return res.status(400).json({ error: "Unsupported exchange" });
  }
  const rec = getRecord(userId, exchange);
  if (!rec) {
    return res.status(400).json({ error: "Not connected — save credentials first." });
  }
  const versionAtRead = rec.version;
  const result = exchange === "binance" ? await testBinance(rec) : await testBybit(rec);
  // Only persist the test result if credentials haven't been rotated mid-call.
  updateTestResult(userId, exchange, versionAtRead, result.success ? "ok" : "error", result.message);
  return res.json({
    exchange,
    success: result.success,
    message: result.message,
    testedAt: new Date().toISOString(),
  });
});

export default router;
