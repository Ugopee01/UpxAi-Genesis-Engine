import { Router, type IRouter } from "express";
import axios from "axios";
import crypto from "crypto";
import {
  type ExchangeId,
  ALL_EXCHANGE_IDS,
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
  coinbase: "Coinbase",
  kraken: "Kraken",
  okx: "OKX",
};

// Exchanges that require an additional passphrase alongside apiKey/apiSecret.
const PASSPHRASE_REQUIRED: ReadonlySet<ExchangeId> = new Set(["okx"]);

const SUPPORTED: ExchangeId[] = ALL_EXCHANGE_IDS;

function isExchangeId(v: string): v is ExchangeId {
  return (SUPPORTED as string[]).includes(v);
}

function toStatus(exchange: ExchangeId, rec?: Omit<ExchangeRecord, "apiSecret" | "passphrase">) {
  const requiresPassphrase = PASSPHRASE_REQUIRED.has(exchange);
  if (!rec) {
    return {
      exchange,
      name: EXCHANGE_NAMES[exchange],
      configured: false,
      lastTestStatus: "untested" as const,
      requiresPassphrase,
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
    requiresPassphrase,
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
  const passphrase = (req.body?.passphrase as string | undefined)?.trim() ?? "";
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: "apiKey and apiSecret are required" });
  }
  if (apiKey.length < 8 || apiSecret.length < 8) {
    return res.status(400).json({ error: "apiKey and apiSecret look too short" });
  }
  if (PASSPHRASE_REQUIRED.has(exchange) && !passphrase) {
    return res
      .status(400)
      .json({ error: `${EXCHANGE_NAMES[exchange]} requires a passphrase.` });
  }
  const saved = setRecord(userId, {
    exchange,
    apiKey,
    apiSecret,
    passphrase: passphrase || undefined,
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

interface NetworkErrorLike {
  response?: { data?: unknown; status?: number };
  message?: string;
  code?: string;
}

function isNetworkUnreachable(e: NetworkErrorLike): boolean {
  return (
    e.code === "ENOTFOUND" ||
    e.code === "EAI_AGAIN" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ECONNREFUSED" ||
    e.code === "ECONNRESET"
  );
}

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
    const e = err as NetworkErrorLike & { response?: { data?: { msg?: string } } };
    if (e.response?.data?.msg) {
      return { success: false, message: `Binance: ${e.response.data.msg}` };
    }
    if (isNetworkUnreachable(e)) {
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
    const e = err as NetworkErrorLike & { response?: { data?: { retMsg?: string } } };
    if (e.response?.data?.retMsg) {
      return { success: false, message: `Bybit: ${e.response.data.retMsg}` };
    }
    if (isNetworkUnreachable(e)) {
      return { success: false, message: "Bybit unreachable from this network. Try after deployment." };
    }
    return { success: false, message: e.message || "Unknown error contacting Bybit." };
  }
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a Coinbase Advanced Trade API JWT (ES256, signed with the user's
 * EC private key in PEM form). The `apiKey` is the key name supplied by
 * Coinbase (e.g. `organizations/{org_id}/apiKeys/{key_id}`) and the
 * `apiSecret` is the EC private key PEM block.
 */
function signCoinbaseJwt(
  apiKeyName: string,
  apiPrivateKeyPem: string,
  method: string,
  requestPath: string,
  host: string,
): string {
  const header = {
    typ: "JWT",
    alg: "ES256",
    kid: apiKeyName,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: apiKeyName,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    uri: `${method} ${host}${requestPath}`,
  };
  const signingInput =
    base64UrlEncode(JSON.stringify(header)) +
    "." +
    base64UrlEncode(JSON.stringify(payload));

  const keyObj = crypto.createPrivateKey({ key: apiPrivateKeyPem });
  const der = crypto.sign("sha256", Buffer.from(signingInput), {
    key: keyObj,
    dsaEncoding: "ieee-p1363",
  });
  return signingInput + "." + base64UrlEncode(der);
}

async function testCoinbase(rec: ExchangeRecord): Promise<{ success: boolean; message: string }> {
  // Normalise the secret — UIs often paste \n-escaped PEM blocks.
  const pem = rec.apiSecret.includes("\\n")
    ? rec.apiSecret.replace(/\\n/g, "\n")
    : rec.apiSecret;
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) {
    return {
      success: false,
      message:
        "Coinbase: API Secret must be the EC private key PEM (BEGIN/END PRIVATE KEY block) from your CDP key.",
    };
  }
  const host = "api.coinbase.com";
  const requestPath = "/api/v3/brokerage/accounts";
  let token: string;
  try {
    token = signCoinbaseJwt(rec.apiKey, pem, "GET", requestPath, host);
  } catch (err) {
    const e = err as { message?: string };
    return {
      success: false,
      message: `Coinbase: failed to sign JWT — ${e.message || "invalid key"}.`,
    };
  }
  try {
    const r = await axios.get(`https://${host}${requestPath}`, {
      timeout: 8000,
      headers: { Authorization: `Bearer ${token}` },
    });
    const accounts = Array.isArray(r.data?.accounts) ? r.data.accounts.length : 0;
    return { success: true, message: `Authenticated — ${accounts} account(s) visible.` };
  } catch (err) {
    const e = err as NetworkErrorLike & {
      response?: { data?: { message?: string; error?: string }; status?: number };
    };
    const apiMsg =
      e.response?.data?.message ||
      e.response?.data?.error ||
      (typeof e.response?.data === "string" ? e.response.data : undefined);
    if (apiMsg) {
      return { success: false, message: `Coinbase: ${apiMsg}` };
    }
    if (e.response?.status === 401) {
      return { success: false, message: "Coinbase: 401 Unauthorized — check API key name and private key." };
    }
    if (isNetworkUnreachable(e)) {
      return { success: false, message: "Coinbase unreachable from this network. Try after deployment." };
    }
    return { success: false, message: e.message || "Unknown error contacting Coinbase." };
  }
}

async function testKraken(rec: ExchangeRecord): Promise<{ success: boolean; message: string }> {
  // Kraken: nonce + body, hashed with SHA256, then HMAC-SHA512 over
  // (uri_path || sha256_hash) using the base64-decoded API secret.
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(rec.apiSecret, "base64");
    if (secretBytes.length === 0) throw new Error("empty");
  } catch {
    return {
      success: false,
      message: "Kraken: API Secret must be the base64 private key from your Kraken API setup.",
    };
  }
  const path = "/0/private/Balance";
  const nonce = Date.now().toString();
  const body = `nonce=${nonce}`;
  const sha256 = crypto.createHash("sha256").update(nonce + body).digest();
  const hmacInput = Buffer.concat([Buffer.from(path, "utf8"), sha256]);
  const signature = crypto
    .createHmac("sha512", secretBytes)
    .update(hmacInput)
    .digest("base64");
  try {
    const r = await axios.post(`https://api.kraken.com${path}`, body, {
      timeout: 8000,
      headers: {
        "API-Key": rec.apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = r.data;
    if (Array.isArray(data?.error) && data.error.length > 0) {
      return { success: false, message: `Kraken: ${data.error.join(", ")}` };
    }
    const balances = data?.result ? Object.keys(data.result).length : 0;
    return { success: true, message: `Authenticated — ${balances} balance(s) visible.` };
  } catch (err) {
    const e = err as NetworkErrorLike & { response?: { data?: { error?: string[] } } };
    const errs = e.response?.data?.error;
    if (Array.isArray(errs) && errs.length > 0) {
      return { success: false, message: `Kraken: ${errs.join(", ")}` };
    }
    if (isNetworkUnreachable(e)) {
      return { success: false, message: "Kraken unreachable from this network. Try after deployment." };
    }
    return { success: false, message: e.message || "Unknown error contacting Kraken." };
  }
}

async function testOkx(rec: ExchangeRecord): Promise<{ success: boolean; message: string }> {
  if (!rec.passphrase) {
    return {
      success: false,
      message: "OKX: passphrase is missing — reconnect with the passphrase you set when creating the API key.",
    };
  }
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  const prehash = `${timestamp}${method}${requestPath}`;
  const signature = crypto
    .createHmac("sha256", rec.apiSecret)
    .update(prehash)
    .digest("base64");
  try {
    const r = await axios.get(`https://www.okx.com${requestPath}`, {
      timeout: 8000,
      headers: {
        "OK-ACCESS-KEY": rec.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": rec.passphrase,
        "Content-Type": "application/json",
      },
    });
    const data = r.data;
    if (data?.code && String(data.code) !== "0") {
      return { success: false, message: `OKX: ${data.msg || `code ${data.code}`}` };
    }
    const accounts = Array.isArray(data?.data) ? data.data.length : 0;
    return { success: true, message: `Authenticated — ${accounts} account record(s) visible.` };
  } catch (err) {
    const e = err as NetworkErrorLike & {
      response?: { data?: { msg?: string; code?: string | number } };
    };
    if (e.response?.data?.msg) {
      return { success: false, message: `OKX: ${e.response.data.msg}` };
    }
    if (isNetworkUnreachable(e)) {
      return { success: false, message: "OKX unreachable from this network. Try after deployment." };
    }
    return { success: false, message: e.message || "Unknown error contacting OKX." };
  }
}

const TESTERS: Record<
  ExchangeId,
  (rec: ExchangeRecord) => Promise<{ success: boolean; message: string }>
> = {
  binance: testBinance,
  bybit: testBybit,
  coinbase: testCoinbase,
  kraken: testKraken,
  okx: testOkx,
};

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
  const result = await TESTERS[exchange](rec);
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
