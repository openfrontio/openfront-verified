import { promises as fs } from "fs";
import path from "path";
import { getAddress, type Address } from "viem";

type PersistentId = string;

interface WalletRecord {
  address: Address;
  updatedAt: number;
}

interface NonceRecord {
  nonce: string;
  expiresAt: number;
}

const inMemoryLinks = new Map<PersistentId, WalletRecord>();
const inMemoryNonces = new Map<PersistentId, NonceRecord>();

const STORE_PATH =
  process.env.WALLET_LINK_FILE ?? "/tmp/openfront-wallet-links.json";
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

console.log("[WalletLinking] Using wallet link file:", STORE_PATH);

function randomNonce(): string {
  // 32 bytes hex
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadFromFile(): Promise<Map<PersistentId, WalletRecord>> {
  try {
    const buf = await fs.readFile(STORE_PATH, "utf8");
    const json = JSON.parse(buf) as Record<PersistentId, WalletRecord>;
    const m = new Map<PersistentId, WalletRecord>();
    Object.entries(json).forEach(([k, v]) => m.set(k, v));
    console.log(`[WalletLinking] Loaded ${m.size} wallet links from file`);
    return m;
  } catch (e) {
    console.log(
      `[WalletLinking] No existing file found, starting fresh:`,
      STORE_PATH,
    );
    return new Map<PersistentId, WalletRecord>();
  }
}

async function saveToFile(map: Map<PersistentId, WalletRecord>): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(STORE_PATH);
    await fs.mkdir(dir, { recursive: true });

    const obj: Record<PersistentId, WalletRecord> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    await fs.writeFile(STORE_PATH, JSON.stringify(obj, null, 2), "utf8");
    console.log(
      `[WalletLinking] Saved ${map.size} wallet links to file:`,
      STORE_PATH,
    );
  } catch (e) {
    console.error("[WalletLinking] Failed to save wallet links:", e);
    throw e;
  }
}

export async function issueNonce(
  persistentId: PersistentId,
): Promise<NonceRecord> {
  const nonce = randomNonce();
  const rec = {
    nonce,
    expiresAt: Date.now() + NONCE_TTL_MS,
  } satisfies NonceRecord;
  inMemoryNonces.set(persistentId, rec);
  return rec;
}

export function validateAndConsumeNonce(
  persistentId: PersistentId,
  nonce: string,
): boolean {
  const rec = inMemoryNonces.get(persistentId);
  if (!rec) return false;
  const ok = rec.nonce === nonce && Date.now() < rec.expiresAt;
  if (ok) inMemoryNonces.delete(persistentId);
  return ok;
}

export async function setLinkedAddress(
  persistentId: PersistentId,
  addr: string,
): Promise<void> {
  console.log(`[WalletLinking] Linking wallet:`, {
    persistentId,
    address: addr,
    storePath: STORE_PATH,
  });

  const checksummed = getAddress(addr);
  const map = await loadFromFile();
  map.set(persistentId, { address: checksummed, updatedAt: Date.now() });
  inMemoryLinks.set(persistentId, {
    address: checksummed,
    updatedAt: Date.now(),
  });

  await saveToFile(map);

  console.log(`✅ [WalletLinking] Wallet linked successfully:`, {
    persistentId,
    address: checksummed,
    totalLinks: map.size,
  });
}

export async function unlinkAddress(persistentId: PersistentId): Promise<void> {
  const map = await loadFromFile();
  map.delete(persistentId);
  inMemoryLinks.delete(persistentId);
  await saveToFile(map);
}

export async function getLinkedAddress(
  persistentId: PersistentId,
): Promise<Address | null> {
  // Always reload from file to get latest (cross-worker consistency)
  const map = await loadFromFile();
  const record = map.get(persistentId);

  // Update in-memory cache
  if (record) {
    inMemoryLinks.set(persistentId, record);
  }

  console.log(`[WalletLinking] getLinkedAddress for ${persistentId}:`, {
    address: record?.address ?? null,
    found: !!record,
  });

  return record?.address ?? null;
}
