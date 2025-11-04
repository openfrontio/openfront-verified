import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseGwei,
  type Address,
  type Hash,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { megaethTestnet } from "viem/chains";
import { ContractABI } from "./ContractABI";
import { logger } from "./Logger";

const log = logger.child({ comp: "onchain" });

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ERC20_SYMBOL_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const ERC20_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// Configuration
const RPC_URL = process.env.RPC_URL ?? "https://carrot.megaeth.com/rpc";
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS ??
  "0x89F80517908556a9C1D165fe34bD6DbCD91D0762") as Address;
const MNEMONIC = process.env.MNEMONIC;

// Always use Base Sepolia
const chain = megaethTestnet;

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

const GAS_LIMIT = 1_000_000_000n;
const MAX_FEE_PER_GAS = parseGwei("0.0025");
const MAX_PRIORITY_FEE_PER_GAS = parseGwei("0.001");

async function submitRawContractWrite(params: {
  functionName: string;
  args?: any[];
  value?: bigint;
}): Promise<Hash> {
  if (!serverAccount) {
    throw new Error("Server account unavailable for contract write");
  }

  const data = encodeFunctionData({
    abi: ContractABI as unknown as any,
    functionName: params.functionName,
    args: params.args ?? [],
  });

  const nonce = await publicClient.getTransactionCount({
    address: serverAccount.address,
    blockTag: "pending",
  });

  const request: any = {
    account: serverAccount,
    chain,
    to: CONTRACT_ADDRESS,
    data,
    nonce,
    gas: GAS_LIMIT,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    type: "eip1559",
  };

  if (typeof params.value !== "undefined") {
    request.value = params.value;
  }

  const serializedTransaction = await walletClient.signTransaction(request);

  return await publicClient.sendRawTransaction({
    serializedTransaction,
  });
}

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
  wagerToken: Address;
  wagerSymbol: string;
  wagerDecimals: number;
  isNative: boolean;
  allowlistEnabled: boolean;
};

export async function getLobbyInfo(lobbyId: string): Promise<LobbyInfo | null> {
  try {
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    const result = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ContractABI as unknown as any,
      functionName: "getLobby",
      args: [lobbyIdBytes32],
    })) as [Address, bigint, Address[], number, Address, bigint, Address];

    const [
      host,
      betAmount,
      participants,
      status,
      winner,
      totalPrize,
      stakeToken,
    ] = result;
    const [allowlistFlag, symbol] = await Promise.all([
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ContractABI as unknown as any,
        functionName: "isAllowlistEnabled",
        args: [lobbyIdBytes32],
      }) as Promise<boolean>,
      stakeToken === ZERO_ADDRESS
        ? Promise.resolve("ETH")
        : (publicClient.readContract({
            address: stakeToken,
            abi: ERC20_SYMBOL_ABI,
            functionName: "symbol",
          }) as Promise<string>),
    ]);

    let decimals = 18;
    if (stakeToken !== ZERO_ADDRESS) {
      try {
        decimals = Number(
          await publicClient.readContract({
            address: stakeToken,
            abi: ERC20_DECIMALS_ABI,
            functionName: "decimals",
          }),
        );
      } catch (error) {
        log.warn(
          `Failed to fetch token decimals for ${stakeToken}: ${String(error)}`,
        );
        decimals = 18;
      }
    }

    if (host === "0x0000000000000000000000000000000000000000") return null;
    return {
      host,
      betAmount,
      participants,
      status: status as GameStatus,
      winner,
      totalPrize,
      wagerToken: stakeToken,
      wagerSymbol: symbol,
      wagerDecimals: decimals,
      isNative: stakeToken === ZERO_ADDRESS,
      allowlistEnabled: allowlistFlag,
    };
  } catch (e) {
    return null;
  }
}

export async function isAddressAllowlistedOnChain(
  lobbyId: string,
  account: Address,
): Promise<boolean> {
  try {
    const lobbyIdBytes32 = stringToBytes32(lobbyId);
    return (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ContractABI as unknown as any,
      functionName: "isAllowlisted",
      args: [lobbyIdBytes32, getAddress(account)],
    })) as boolean;
  } catch (e) {
    log.warn("Failed to check allowlist status", {
      lobbyId,
      account,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
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
        const hash = await submitRawContractWrite({
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

        const hash = await submitRawContractWrite({
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

export async function cancelLobbyOnChain(
  lobbyId: string,
): Promise<string | null> {
  try {
    if (!serverAccount) {
      log.error("Cannot cancel lobby: no server account configured");
      return null;
    }

    const lobbyIdBytes32 = stringToBytes32(lobbyId);

    log.info("Cancelling lobby on-chain", {
      lobbyId,
      serverAccount: serverAccount.address,
    });

    const hash = await submitRawContractWrite({
      functionName: "cancelLobby",
      args: [lobbyIdBytes32],
    });

    log.info("Lobby cancellation transaction submitted", {
      lobbyId,
      txHash: hash,
    });

    return hash;
  } catch (e) {
    log.error("cancelLobbyOnChain exception", {
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
