import { promises as fs } from "fs";
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

const STORE_PATH = process.env.WALLET_LINK_FILE;
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function randomNonce(): string {
  // 32 bytes hex
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadFromFile(): Promise<Map<PersistentId, WalletRecord>> {
  if (!STORE_PATH) return inMemoryLinks;
  try {
    const buf = await fs.readFile(STORE_PATH, "utf8");
    const json = JSON.parse(buf) as Record<PersistentId, WalletRecord>;
    const m = new Map<PersistentId, WalletRecord>();
    Object.entries(json).forEach(([k, v]) => m.set(k, v));
    return m;
  } catch {
    return new Map<PersistentId, WalletRecord>();
  }
}

async function saveToFile(map: Map<PersistentId, WalletRecord>): Promise<void> {
  if (!STORE_PATH) return;
  const obj: Record<PersistentId, WalletRecord> = {};
  for (const [k, v] of map.entries()) obj[k] = v;
  await fs.writeFile(STORE_PATH, JSON.stringify(obj, null, 2), "utf8");
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
  const checksummed = getAddress(addr);
  const map = await loadFromFile();
  map.set(persistentId, { address: checksummed, updatedAt: Date.now() });
  inMemoryLinks.set(persistentId, {
    address: checksummed,
    updatedAt: Date.now(),
  });
  await saveToFile(map);
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
  const mem = inMemoryLinks.get(persistentId);
  if (mem) return mem.address;
  const map = await loadFromFile();
  return map.get(persistentId)?.address ?? null;
}
