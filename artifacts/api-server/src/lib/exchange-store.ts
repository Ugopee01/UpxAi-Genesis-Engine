import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { SINGLE_USER_ID } from "./session";

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

export type ExchangeId = "binance" | "bybit" | "coinbase" | "kraken" | "okx";

export const ALL_EXCHANGE_IDS: ExchangeId[] = [
  "binance",
  "bybit",
  "coinbase",
  "kraken",
  "okx",
];

export interface ExchangeRecord {
  exchange: ExchangeId;
  apiKey: string;
  apiSecret: string;
  /** Optional additional secret. Currently used by OKX. */
  passphrase?: string;
  version: string;
  lastTestedAt?: string;
  lastTestStatus: "ok" | "error" | "untested";
  lastTestMessage?: string;
}

interface PersistedRecord
  extends Omit<ExchangeRecord, "apiSecret" | "passphrase"> {
  apiSecretCipher: string;
  /** Encrypted passphrase. Optional — only present for exchanges that need one. */
  passphraseCipher?: string;
}

type UserStore = Partial<Record<ExchangeId, PersistedRecord>>;
type Store = Record<string, UserStore>;

// In production, fail fast if the operator hasn't set an explicit encryption
// key — never silently fall back to a predictable default.
if (process.env.NODE_ENV === "production" && !process.env.UPXAI_STORE_KEY) {
  throw new Error(
    "UPXAI_STORE_KEY is required in production to encrypt exchange credentials at rest.",
  );
}
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

function isLegacyFlatStore(parsed: unknown): parsed is UserStore {
  if (!parsed || typeof parsed !== "object") return false;
  // Legacy flat shape: top-level keys are exchange ids and the values look
  // like persisted records (have an `apiSecretCipher` string).
  for (const key of Object.keys(parsed as Record<string, unknown>)) {
    if (!(ALL_EXCHANGE_IDS as string[]).includes(key)) return false;
    const v = (parsed as Record<string, unknown>)[key];
    if (!v || typeof v !== "object") return false;
    if (typeof (v as Record<string, unknown>).apiSecretCipher !== "string") {
      return false;
    }
  }
  return Object.keys(parsed as Record<string, unknown>).length > 0;
}

function load(): Store {
  ensureDir();
  if (!fs.existsSync(storeFile)) return {};
  try {
    const raw = fs.readFileSync(storeFile, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (isLegacyFlatStore(parsed)) {
      // One-time migration: pre-auth records belong to the single owner.
      const migrated: Store = { [SINGLE_USER_ID]: parsed };
      save(migrated);
      return migrated;
    }
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function save(store: Store) {
  ensureDir();
  fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function toMemory(p: PersistedRecord): ExchangeRecord {
  const { apiSecretCipher, passphraseCipher, ...rest } = p;
  const out: ExchangeRecord = {
    ...rest,
    apiSecret: decrypt(apiSecretCipher),
  };
  if (passphraseCipher) {
    out.passphrase = decrypt(passphraseCipher);
  }
  return out;
}

function toPersisted(r: ExchangeRecord): PersistedRecord {
  const { apiSecret, passphrase, ...rest } = r;
  const out: PersistedRecord = {
    ...rest,
    apiSecretCipher: encrypt(apiSecret),
  };
  if (passphrase) {
    out.passphraseCipher = encrypt(passphrase);
  }
  return out;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(Math.max(0, key.length - 2)) + key.slice(-2);
  return "••••••" + key.slice(-4);
}

export function getRecord(
  userId: string,
  exchange: ExchangeId,
): ExchangeRecord | undefined {
  const p = load()[userId]?.[exchange];
  if (!p) return undefined;
  try {
    return toMemory(p);
  } catch {
    return undefined;
  }
}

export function setRecord(
  userId: string,
  input: Omit<ExchangeRecord, "version"> & { version?: string },
): ExchangeRecord {
  const store = load();
  const userStore: UserStore = store[userId] ?? {};
  const record: ExchangeRecord = {
    ...input,
    version: crypto.randomUUID(),
  };
  userStore[record.exchange] = toPersisted(record);
  store[userId] = userStore;
  save(store);
  return record;
}

export function deleteRecord(userId: string, exchange: ExchangeId): void {
  const store = load();
  const userStore = store[userId];
  if (!userStore) return;
  delete userStore[exchange];
  if (Object.keys(userStore).length === 0) {
    delete store[userId];
  } else {
    store[userId] = userStore;
  }
  save(store);
}

export function listSummaries(
  userId: string,
): Array<Omit<ExchangeRecord, "apiSecret" | "passphrase">> {
  const userStore = load()[userId];
  if (!userStore) return [];
  const out: Array<Omit<ExchangeRecord, "apiSecret" | "passphrase">> = [];
  for (const key of Object.keys(userStore) as ExchangeId[]) {
    const p = userStore[key];
    if (!p) continue;
    const {
      apiSecretCipher: _ignored,
      passphraseCipher: _ignoredPass,
      ...rest
    } = p;
    void _ignored;
    void _ignoredPass;
    out.push(rest);
  }
  return out;
}

/**
 * Update test result, but only if the underlying credential version still matches.
 * Returns true if the update was applied; false if the credentials have been rotated.
 */
export function updateTestResult(
  userId: string,
  exchange: ExchangeId,
  expectedVersion: string,
  status: "ok" | "error",
  message: string,
): boolean {
  const store = load();
  const rec = store[userId]?.[exchange];
  if (!rec || rec.version !== expectedVersion) return false;
  rec.lastTestedAt = new Date().toISOString();
  rec.lastTestStatus = status;
  rec.lastTestMessage = message;
  save(store);
  return true;
}
