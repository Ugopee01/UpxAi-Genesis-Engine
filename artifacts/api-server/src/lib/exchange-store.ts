import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve dataDir deterministically to <api-server-root>/data, where
// api-server-root is the nearest ancestor directory that contains a
// package.json with name "@workspace/api-server". Works for src (tsx),
// dist (bundled), or any future build layout — and never writes inside
// dist/, which gets wiped on rebuild.
function findApiServerRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg?.name === "@workspace/api-server") return dir;
      }
    } catch {
      // ignore parse errors and keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: walk up until we hit a directory literally named "api-server"
  let cursor = start;
  for (let i = 0; i < 10; i++) {
    if (path.basename(cursor) === "api-server") return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  // Last resort
  return path.resolve(start, "..");
}

const apiServerRoot = findApiServerRoot(__dirname);
const dataDir = path.join(apiServerRoot, "data");
const storeFile = path.join(dataDir, "exchanges.json");

export type ExchangeId = "binance" | "bybit";

export interface ExchangeRecord {
  exchange: ExchangeId;
  apiKey: string;
  apiSecret: string;
  version: string;
  lastTestedAt?: string;
  lastTestStatus: "ok" | "error" | "untested";
  lastTestMessage?: string;
}

interface PersistedRecord extends Omit<ExchangeRecord, "apiSecret"> {
  apiSecretCipher: string;
}

type Store = Partial<Record<ExchangeId, PersistedRecord>>;

const KEY_MATERIAL =
  process.env.UPXAI_STORE_KEY ??
  "upxai-genesis-engine-default-key-rotate-in-prod";
const ENC_KEY = crypto.createHash("sha256").update(KEY_MATERIAL).digest();

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Bad cipher payload");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function load(): Store {
  ensureDir();
  if (!fs.existsSync(storeFile)) return {};
  try {
    const raw = fs.readFileSync(storeFile, "utf-8");
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function save(store: Store) {
  ensureDir();
  fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function toMemory(p: PersistedRecord): ExchangeRecord {
  return { ...p, apiSecret: decrypt(p.apiSecretCipher) };
}

function toPersisted(r: ExchangeRecord): PersistedRecord {
  const { apiSecret, ...rest } = r;
  return { ...rest, apiSecretCipher: encrypt(apiSecret) };
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(Math.max(0, key.length - 2)) + key.slice(-2);
  return "••••••" + key.slice(-4);
}

export function getRecord(exchange: ExchangeId): ExchangeRecord | undefined {
  const p = load()[exchange];
  if (!p) return undefined;
  try {
    return toMemory(p);
  } catch {
    return undefined;
  }
}

export function setRecord(input: Omit<ExchangeRecord, "version"> & { version?: string }): ExchangeRecord {
  const store = load();
  const record: ExchangeRecord = {
    ...input,
    version: crypto.randomUUID(),
  };
  store[record.exchange] = toPersisted(record);
  save(store);
  return record;
}

export function deleteRecord(exchange: ExchangeId): void {
  const store = load();
  delete store[exchange];
  save(store);
}

export function listSummaries(): Array<Omit<ExchangeRecord, "apiSecret">> {
  const store = load();
  const out: Array<Omit<ExchangeRecord, "apiSecret">> = [];
  for (const key of Object.keys(store) as ExchangeId[]) {
    const p = store[key];
    if (!p) continue;
    const { apiSecretCipher: _ignored, ...rest } = p;
    void _ignored;
    out.push(rest);
  }
  return out;
}

/**
 * Update test result, but only if the underlying credential version still matches.
 * Returns true if the update was applied; false if the credentials have been rotated.
 */
export function updateTestResult(
  exchange: ExchangeId,
  expectedVersion: string,
  status: "ok" | "error",
  message: string,
): boolean {
  const store = load();
  const rec = store[exchange];
  if (!rec || rec.version !== expectedVersion) return false;
  rec.lastTestedAt = new Date().toISOString();
  rec.lastTestStatus = status;
  rec.lastTestMessage = message;
  save(store);
  return true;
}
