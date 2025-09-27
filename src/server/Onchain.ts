import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { localhost } from "viem/chains";
import { ContractABI } from "./ContractABI";

// Configuration
const RPC_URL =
  process.env.RPC_URL ?? "https://ethereum-sepolia.publicnode.com";
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;
const MNEMONIC = process.env.mnemonic;

// Derive the server account from mnemonic (HD path m/44'/60'/0'/0/0)
const serverAccount = MNEMONIC ? mnemonicToAccount(MNEMONIC) : undefined;

// Clients
export const publicClient = createPublicClient({
  chain: localhost,
  transport: http(RPC_URL),
});

export const walletClient = createWalletClient({
  account: serverAccount,
  chain: localhost,
  transport: http(RPC_URL),
});

function stringToBytes32(str: string): `0x${string}` {
  if (str.startsWith("0x") && str.length === 66) return str as `0x${string}`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  const hex = Array.from(padded)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as `0x${string}`;
}

export enum GameStatus {
  Created = 0,
  InProgress = 1,
  Finished = 2,
  Claimed = 3,
}

export type LobbyInfo = {
  host: Address;
  betAmount: bigint;
  participants: Address[];
  status: GameStatus;
  winner: Address;
  totalPrize: bigint;
};

export async function getLobbyInfo(lobbyId: string): Promise<LobbyInfo | null> {
  try {
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    const result = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ContractABI as unknown as any,
      functionName: "getLobby",
      args: [lobbyIdBytes32],
    })) as [Address, bigint, Address[], number, Address, bigint];

    const [host, betAmount, participants, status, winner, totalPrize] = result;
    if (host === "0x0000000000000000000000000000000000000000") return null;
    return {
      host,
      betAmount,
      participants,
      status: status as GameStatus,
      winner,
      totalPrize,
    };
  } catch (e) {
    return null;
  }
}

export async function isLobbyOnChain(lobbyId: string): Promise<boolean> {
  const info = await getLobbyInfo(lobbyId);
  return info !== null;
}

export async function getConfiguredGameServer(): Promise<Address | null> {
  try {
    const addr = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ContractABI as unknown as any,
      functionName: "gameServer",
      args: [],
    })) as Address;
    return addr;
  } catch (_e) {
    return null;
  }
}

export function getDerivedServerAddress(): Address | null {
  return serverAccount?.address ?? null;
}

export async function startGameOnChain(
  lobbyId: string,
): Promise<string | null> {
  try {
    if (!serverAccount) return null;
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    // Retry write a few times in case of transient RPC errors
    const maxAttempts = 3;
    let lastError: unknown = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const hash = await walletClient.writeContract({
          account: serverAccount,
          address: CONTRACT_ADDRESS,
          abi: ContractABI as unknown as any,
          functionName: "startGame",
          args: [lobbyIdBytes32],
        });
        return hash;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }
    throw lastError ?? new Error("startGame write failed");
  } catch (e) {
    return null;
  }
}

export async function startGameOnChainAndConfirm(
  lobbyId: string,
): Promise<boolean> {
  try {
    const hash = await startGameOnChain(lobbyId);
    if (hash === null) return false;
    const receipt = await waitForTransactionReceipt(publicClient, {
      hash: hash as `0x${string}`,
    });
    if (receipt.status !== "success") return false;
    const info = await getLobbyInfo(lobbyId);
    return info !== null && info.status === GameStatus.InProgress;
  } catch (_e) {
    return false;
  }
}

export async function declareWinnerOnChain(
  lobbyId: string,
  winnerAddress: Address,
): Promise<string | null> {
  try {
    if (!serverAccount) return null;
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    const maxAttempts = 3;
    let lastError: unknown = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const hash = await walletClient.writeContract({
          account: serverAccount,
          address: CONTRACT_ADDRESS,
          abi: ContractABI as unknown as any,
          functionName: "declareWinner",
          args: [lobbyIdBytes32, getAddress(winnerAddress)],
        });
        return hash;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }
    throw lastError ?? new Error("declareWinner write failed");
  } catch (e) {
    return null;
  }
}

export async function declareWinnerOnChainAndConfirm(
  lobbyId: string,
  winnerAddress: Address,
): Promise<boolean> {
  try {
    const hash = await declareWinnerOnChain(lobbyId, winnerAddress);
    if (hash === null) return false;
    const receipt = await waitForTransactionReceipt(publicClient, {
      hash: hash as `0x${string}`,
    });
    if (receipt.status !== "success") return false;
    const info = await getLobbyInfo(lobbyId);
    // Contract sets status Finished on declareWinner
    return (
      info !== null &&
      info.status === GameStatus.Finished &&
      info.winner !== "0x0000000000000000000000000000000000000000"
    );
  } catch (_e) {
    return false;
  }
}
