import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { baseSepolia } from "viem/chains";
import { ContractABI } from "./ContractABI";
import { logger } from "./Logger";

const log = logger.child({ comp: "onchain" });

// Configuration
const RPC_URL =
  process.env.RPC_URL ?? "https://ethereum-sepolia.publicnode.com";
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;
const MNEMONIC = process.env.MNEMONIC;

// Always use Base Sepolia
const chain = baseSepolia;

// Log configuration on startup
log.info("On-chain configuration:", {
  rpcUrl: RPC_URL,
  contractAddress: CONTRACT_ADDRESS,
  chain: chain.name,
  chainId: chain.id,
  hasMnemonic: !!MNEMONIC,
  mnemonicWords: MNEMONIC ? MNEMONIC.trim().split(/\s+/).length : 0,
});

// Derive the server account from mnemonic (HD path m/44'/60'/0'/0/0)
const serverAccount = MNEMONIC ? mnemonicToAccount(MNEMONIC) : undefined;

if (serverAccount) {
  log.info("Server account derived from mnemonic:", {
    address: serverAccount.address,
  });
} else {
  log.warn(
    "No mnemonic configured - server CANNOT declare winners on-chain or start games!",
  );
}

// Clients
export const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

export const walletClient = createWalletClient({
  account: serverAccount,
  chain,
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

function bytes32ToString(bytes32: string): string {
  const hex = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
  const trimmed = hex.replace(/0+$/, "");
  const bytes: number[] = [];
  for (let i = 0; i < trimmed.length; i += 2) {
    bytes.push(parseInt(trimmed.substring(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
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
    if (!serverAccount) {
      log.error(
        "Cannot declare winner: no server account (mnemonic not configured)",
      );
      return null;
    }

    log.info("Declaring winner on-chain", {
      lobbyId,
      winnerAddress,
      serverAccount: serverAccount.address,
      contractAddress: CONTRACT_ADDRESS,
    });

    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        log.info(`Attempt ${i + 1}/${maxAttempts} to call declareWinner`, {
          lobbyId,
        });

        const hash = await walletClient.writeContract({
          account: serverAccount,
          address: CONTRACT_ADDRESS,
          abi: ContractABI as unknown as any,
          functionName: "declareWinner",
          args: [lobbyIdBytes32, getAddress(winnerAddress)],
        });

        log.info("Transaction submitted", {
          lobbyId,
          txHash: hash,
        });

        return hash;
      } catch (e) {
        lastError = e;
        log.warn(`Attempt ${i + 1} failed, retrying...`, {
          lobbyId,
          error: e instanceof Error ? e.message : String(e),
        });
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }

    log.error("All attempts failed to declare winner", {
      lobbyId,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });

    throw lastError ?? new Error("declareWinner write failed");
  } catch (e) {
    log.error("declareWinnerOnChain exception", {
      lobbyId,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return null;
  }
}

export async function declareWinnerOnChainAndConfirm(
  lobbyId: string,
  winnerAddress: Address,
): Promise<boolean> {
  try {
    log.info("Starting declareWinnerOnChainAndConfirm", {
      lobbyId,
      winnerAddress,
    });

    const hash = await declareWinnerOnChain(lobbyId, winnerAddress);
    if (hash === null) {
      log.error("declareWinnerOnChain returned null (transaction failed)", {
        lobbyId,
      });
      return false;
    }

    log.info("Waiting for transaction receipt", {
      lobbyId,
      txHash: hash,
    });

    const receipt = await waitForTransactionReceipt(publicClient, {
      hash: hash as `0x${string}`,
    });

    log.info("Transaction receipt received", {
      lobbyId,
      txHash: hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    if (receipt.status !== "success") {
      log.error("Transaction reverted", {
        lobbyId,
        txHash: hash,
        status: receipt.status,
      });
      return false;
    }

    const info = await getLobbyInfo(lobbyId);
    log.info("Verified lobby info after winner declaration", {
      lobbyId,
      status: info?.status,
      statusName: info ? GameStatus[info.status] : "N/A",
      winner: info?.winner,
      expectedWinner: winnerAddress,
    });

    const success =
      info !== null &&
      info.status === GameStatus.Finished &&
      info.winner !== "0x0000000000000000000000000000000000000000";

    if (success) {
      log.info("✅ Winner declaration CONFIRMED on-chain", {
        lobbyId,
        winner: info.winner,
      });
    } else {
      log.error("❌ Winner declaration verification FAILED", {
        lobbyId,
        hasInfo: !!info,
        status: info?.status,
        winner: info?.winner,
      });
    }

    return success;
  } catch (e) {
    log.error("declareWinnerOnChainAndConfirm exception", {
      lobbyId,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return false;
  }
}

export function watchGameStarted(
  onEvent: (lobbyId: string) => void,
): () => void {
  return publicClient.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ContractABI as unknown as any,
    eventName: "GameStarted",
    onLogs: (logs: any[]) => {
      try {
        for (const log of logs) {
          const id = bytes32ToString(log.args?.lobbyId as string);
          onEvent(id);
        }
      } catch (_e) {
        // swallow
      }
    },
  } as any);
}
