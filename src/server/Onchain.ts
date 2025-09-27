import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { localhost } from "viem/chains";
import { ContractABI } from "./ContractABI";

// Configuration
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
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

export async function startGameOnChain(
  lobbyId: string,
): Promise<string | null> {
  try {
    if (!serverAccount) return null;
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    const hash = await walletClient.writeContract({
      account: serverAccount,
      address: CONTRACT_ADDRESS,
      abi: ContractABI as unknown as any,
      functionName: "startGame",
      args: [lobbyIdBytes32],
    });
    return hash;
  } catch (e) {
    return null;
  }
}

export async function declareWinnerOnChain(
  lobbyId: string,
  winnerAddress: Address,
): Promise<string | null> {
  try {
    if (!serverAccount) return null;
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    const hash = await walletClient.writeContract({
      account: serverAccount,
      address: CONTRACT_ADDRESS,
      abi: ContractABI as unknown as any,
      functionName: "declareWinner",
      args: [lobbyIdBytes32, getAddress(winnerAddress)],
    });
    return hash;
  } catch (e) {
    return null;
  }
}

export function getGameServerAddress(): Address {
  return (serverAccount?.address ??
    "0x0000000000000000000000000000000000000000") as Address;
}
