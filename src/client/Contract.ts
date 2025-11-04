import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseGwei,
  parseUnits,
  type Hash,
} from "viem";
import { megaethTestnet } from "viem/chains";
import {
  CONTRACT_ADDRESS,
  FAKE_USD_TOKEN_ADDRESS,
  ZERO_ADDRESS,
} from "./constants/Config";
import { CONTRACT_ABI } from "./constants/ContractABI";
import { ERC20_ABI } from "./constants/ERC20ABI";
import { bytes32ToString, stringToBytes32 } from "./utilities/ContractHelpers";
import { WalletManager } from "./Wallet";

// Determine RPC URL from environment or use default
const RPC_URL =
  typeof process !== "undefined" && process.env?.RPC_URL
    ? process.env.RPC_URL
    : undefined;

console.log("[Contract] Client blockchain config:", {
  contractAddress: CONTRACT_ADDRESS,
  rpcUrl: RPC_URL ?? "default (megaethTestnet public node)",
  chain: "megaethTestnet",
});

// Centralized viem clients and helpers
const publicClient = createPublicClient({
  chain: megaethTestnet,
  transport: RPC_URL ? http(RPC_URL) : http(),
});
let walletClientCache: any | null = null;

const GAS_LIMIT = 1_000_000_000n;
const MAX_FEE_PER_GAS = parseGwei("0.0025");
const MAX_PRIORITY_FEE_PER_GAS = parseGwei("0.001");

async function getWalletClient() {
  if (walletClientCache) return walletClientCache;
  const provider = await window.privyWallet?.getEmbeddedProvider?.();
  if (!provider) throw new Error("Embedded wallet provider unavailable");
  walletClientCache = createWalletClient({
    chain: megaethTestnet,
    transport: custom(provider),
  });
  return walletClientCache;
}

async function wagmiRead(params: {
  address: `0x${string}`;
  abi: any;
  functionName: string;
  args?: any[];
}) {
  return await publicClient.readContract(params as any);
}

async function wagmiWrite(params: {
  address: `0x${string}`;
  abi: any;
  functionName: string;
  args?: any[];
  value?: bigint;
  gas?: bigint;
}) {
  const walletManager = WalletManager.getInstance();
  const account = walletManager.address as `0x${string}` | undefined;
  if (!account) throw new Error("No connected wallet");
  const client = await getWalletClient();

  const { address, abi, functionName, args, value } = params;
  const data = encodeFunctionData({
    abi,
    functionName,
    args: args ?? [],
  });

  const nonce = await publicClient.getTransactionCount({
    address: account,
    blockTag: "pending",
  });

  const request: any = {
    account,
    chain: megaethTestnet,
    to: address,
    data,
    nonce,
    gas: GAS_LIMIT,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  };

  if (typeof value !== "undefined") {
    request.value = value;
  }

  const serializedTransaction = await client.signTransaction(request);

  return await client.sendRawTransaction({
    serializedTransaction,
  });
}

function wagmiWatch(params: {
  address: `0x${string}`;
  abi: any;
  eventName: string;
  args?: any;
  onLogs: (logs: any[]) => void;
}) {
  return publicClient.watchContractEvent(params as any);
}

export function getContractAddress() {
  return CONTRACT_ADDRESS;
}

export function getContractABI() {
  return CONTRACT_ABI;
}

export interface CreateLobbyParams {
  lobbyId: string;
  betAmount: string;
  lobbyVisibility?: "private" | "public";
}

export interface CreateLobbyResult {
  hash: Hash;
  lobbyId: string;
  betAmount: string;
}

export interface JoinLobbyParams {
  lobbyId: string;
}

export interface JoinLobbyResult {
  hash: Hash;
  lobbyId: string;
  playerAddress: string;
}

export interface ClaimPrizeParams {
  lobbyId: string;
}

export interface ClaimPrizeResult {
  hash: Hash;
  lobbyId: string;
  playerAddress: string;
}

export interface StartGameParams {
  lobbyId: string;
}

export interface StartGameResult {
  hash: Hash;
  lobbyId: string;
  playerAddress: string;
}

export interface CancelLobbyParams {
  lobbyId: string;
}

export interface CancelLobbyResult {
  hash: Hash;
  lobbyId: string;
  hostAddress: string;
}

export async function requestFaucetTokens(): Promise<Hash> {
  const walletManager = WalletManager.getInstance();
  const account = walletManager.address as `0x${string}` | undefined;
  if (!account) throw new Error("No connected wallet");

  return await wagmiWrite({
    address: FAKE_USD_TOKEN_ADDRESS,
    abi: [
      {
        type: "function",
        name: "faucet",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "faucet",
  });
}

export async function getTokenBalances(account: `0x${string}`) {
  const balances: { symbol: string; balance: string }[] = [];

  const nativeBalance = await publicClient.getBalance({ address: account });
  balances.push({ symbol: "ETH", balance: formatEther(nativeBalance) });

  try {
    const [fakeBalance, fakeSymbol] = await Promise.all([
      publicClient.readContract({
        address: FAKE_USD_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: FAKE_USD_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "symbol",
      }) as Promise<string>,
    ]);

    balances.push({
      symbol: fakeSymbol,
      balance: formatUnits(fakeBalance, 18),
    });
  } catch (error) {
    console.warn("Failed to fetch fUSD balance:", error);
    balances.push({
      symbol: "fUSD",
      balance: "—",
    });
  }

  return balances;
}

export function getFakeUsdFromWei(wei: bigint): string {
  return formatUnits(wei, 18);
}

export function parseFakeUsd(value: string): bigint {
  return parseUnits(value, 18);
}

export interface SetAllowlistEnabledParams {
  lobbyId: string;
  enabled: boolean;
}

export interface AddToAllowlistParams {
  lobbyId: string;
  addresses: string[];
}

export interface RemoveFromAllowlistParams {
  lobbyId: string;
  addresses: string[];
}

// Wallet connection is handled by Privy via the provider; no manual connect here

export async function createLobby(
  params: CreateLobbyParams,
): Promise<CreateLobbyResult> {
  const { lobbyId, betAmount, lobbyVisibility } = params;

  // Check if wallet is connected via Privy
  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const betAmountWei = parseUnits(betAmount, 18);
  const lobbyIdBytes32 = stringToBytes32(lobbyId);
  const isPublic = lobbyVisibility === "public" ? true : false;

  console.log("Creating lobby on-chain:", {
    lobbyId,
    lobbyIdBytes32,
    betAmount,
    betAmountWei: betAmountWei.toString(),
    contractAddress: CONTRACT_ADDRESS,
    wagerToken: FAKE_USD_TOKEN_ADDRESS,
  });

  const hash = await wagmiWrite({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "createLobby",
    args: [lobbyIdBytes32, betAmountWei, isPublic, FAKE_USD_TOKEN_ADDRESS],
  });

  console.log("Transaction submitted, polling for confirmation...", {
    txHash: hash,
    lobbyId,
  });

  // Poll for lobby to exist on-chain instead of waiting for receipt
  // (more reliable with custom RPCs)
  const maxAttempts = 30;
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `Checking if lobby exists on-chain (attempt ${attempt}/${maxAttempts})...`,
    );

    const lobbyInfo = await getLobbyInfo(lobbyId);

    if (lobbyInfo && lobbyInfo.exists) {
      console.log("✅ Lobby created on-chain successfully!", {
        lobbyId,
        txHash: hash,
        host: lobbyInfo.host,
        betAmount: formatEther(lobbyInfo.betAmount),
        participants: lobbyInfo.participants.length,
        attemptsTaken: attempt,
      });

      return { hash, lobbyId, betAmount };
    }

    // Wait before next attempt
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // If we get here, polling timed out
  throw new Error(
    `Transaction sent (${hash}) but lobby not confirmed on-chain after ${(maxAttempts * pollInterval) / 1000}s. Check block explorer.`,
  );
}

export enum GameStatus {
  Created = 0,
  InProgress = 1,
  Finished = 2,
  Claimed = 3,
}

export interface LobbyInfo {
  host: string;
  betAmount: bigint;
  participants: string[];
  status: GameStatus;
  winner: string;
  totalPrize: bigint;
  wagerToken: string;
  wagerSymbol: string;
  exists: boolean;
}

export interface PublicLobbyInfo {
  lobbyId: string;
  host: string;
  betAmount: bigint;
  participants: string[];
  status: GameStatus;
  winner: string;
  totalPrize: bigint;
  participantCount: number;
  formattedBetAmount: string;
  wagerToken: string;
  wagerSymbol: string;
}

export async function getLobbyInfo(lobbyId: string): Promise<LobbyInfo | null> {
  try {
    const lobbyIdBytes32 = stringToBytes32(lobbyId);

    const result = (await wagmiRead({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getLobby",
      args: [lobbyIdBytes32],
    })) as [string, bigint, string[], number, string, bigint, string];

    const [
      host,
      betAmount,
      participants,
      status,
      winner,
      totalPrize,
      wagerToken,
    ] = result;

    async function resolveSymbol(): Promise<string> {
      if (wagerToken === ZERO_ADDRESS) {
        return "ETH";
      }
      return (await publicClient.readContract({
        address: wagerToken as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
      })) as string;
    }

    const tokenSymbol = await resolveSymbol();

    const exists = host !== ZERO_ADDRESS;

    const lobbyInfo: LobbyInfo = {
      host,
      betAmount,
      participants,
      status: status as GameStatus,
      winner,
      totalPrize,
      wagerToken: wagerToken,
      wagerSymbol: tokenSymbol,
      exists,
    };

    console.log("Lobby info result:", {
      lobbyId,
      exists,
      host,
      betAmount: formatEther(betAmount),
      participants: participants.length,
      status: GameStatus[status],
      winner: winner === ZERO_ADDRESS ? "None" : winner,
      totalPrize: formatEther(totalPrize),
    });

    return lobbyInfo;
  } catch (error) {
    console.error("Error getting lobby info from blockchain:", error);
    return null;
  }
}

export async function isLobbyOnChain(lobbyId: string): Promise<boolean> {
  const lobbyInfo = await getLobbyInfo(lobbyId);
  return lobbyInfo?.exists ?? false;
}

export async function joinLobby(
  params: JoinLobbyParams,
): Promise<JoinLobbyResult> {
  const { lobbyId } = params;

  // Check if wallet is connected via Privy
  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  // First, get the lobby information to know the required bet amount
  const lobbyIdBytes32 = stringToBytes32(lobbyId);

  const lobbyInfo = (await wagmiRead({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getLobby",
    args: [lobbyIdBytes32],
  })) as [string, bigint, string[], number, string, bigint];

  const [host, betAmount, participants, status] = lobbyInfo;

  // Check if lobby exists
  if (host === ZERO_ADDRESS) {
    throw new Error("Lobby does not exist on-chain");
  }

  // Check if user is already a participant (client-side check for better UX)
  const userAddress = walletManager.address!.toLowerCase();
  const isAlreadyParticipant = participants.some(
    (p) => p.toLowerCase() === userAddress,
  );

  if (isAlreadyParticipant) {
    throw new Error("You are already a participant in this lobby");
  }

  // Check if game has already started (status 0 = Created, 1 = InProgress, etc.)
  if (status !== 0) {
    throw new Error("This lobby has already started or finished");
  }

  console.log("Joining lobby with:", {
    lobbyId,
    lobbyIdBytes32,
    betAmount: formatEther(betAmount) + " ETH",
    requiredPayment: betAmount.toString() + " wei",
    currentParticipants: participants.length,
  });

  try {
    // Call the joinLobby function with the required bet amount as payment
    const hash = await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "joinLobby",
      args: [lobbyIdBytes32],
      value: betAmount as any, // Pay the exact bet amount required by the lobby
      // Let wallet auto-estimate gas
    });

    console.log("Successfully joined lobby, transaction hash:", hash);

    return {
      hash,
      lobbyId,
      playerAddress: walletManager.address!,
    };
  } catch (error: any) {
    console.error("Failed to join lobby:", error);

    // Handle specific contract errors
    if (error.message.includes("InsufficientFunds")) {
      throw new Error(
        `Insufficient funds. You need to pay exactly ${formatEther(betAmount)} ETH to join this lobby.`,
      );
    } else if (error.message.includes("GameAlreadyStarted")) {
      throw new Error("This lobby has already started. You cannot join now.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to join lobby: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

export async function claimPrize(
  params: ClaimPrizeParams,
): Promise<ClaimPrizeResult> {
  const { lobbyId } = params;

  // Check if wallet is connected via Privy
  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);

  console.log("Claiming prize for lobby:", {
    lobbyId,
    lobbyIdBytes32,
    playerAddress: walletManager.address,
  });

  try {
    const hash = await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "claimPrize",
      args: [lobbyIdBytes32],
      // Let wallet auto-estimate gas
    });

    console.log("Successfully claimed prize, transaction hash:", hash);

    return {
      hash,
      lobbyId,
      playerAddress: walletManager.address!,
    };
  } catch (error: any) {
    console.error("Failed to claim prize:", error);

    // Handle specific contract errors
    if (error.message.includes("NotWinner")) {
      throw new Error("You are not the winner of this lobby.");
    } else if (error.message.includes("GameNotFinished")) {
      throw new Error("The game has not finished yet.");
    } else if (error.message.includes("PrizeAlreadyClaimed")) {
      throw new Error("Prize has already been claimed.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to claim prize: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

export interface DeclareWinnerParams {
  lobbyId: string;
  winner: string;
}

export interface DeclareWinnerResult {
  hash: Hash;
  lobbyId: string;
  winnerAddress: string;
}

export async function declareWinner(
  params: DeclareWinnerParams,
): Promise<DeclareWinnerResult> {
  const { lobbyId, winner } = params;

  // Check if wallet is connected via Privy
  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);

  console.log("Declaring winner for lobby:", {
    lobbyId,
    lobbyIdBytes32,
    winner,
    callerAddress: walletManager.address,
  });

  try {
    const hash = await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "declareWinner",
      args: [lobbyIdBytes32, winner as `0x${string}`],
      // Let wallet auto-estimate gas
    });

    console.log("Successfully declared winner, transaction hash:", hash);

    return {
      hash,
      lobbyId,
      winnerAddress: winner,
    };
  } catch (error: any) {
    console.error("Failed to declare winner:", error);

    // Handle specific contract errors
    if (error.message.includes("NotGameServer")) {
      throw new Error("Only the game server can declare winners.");
    } else if (error.message.includes("GameNotInProgress")) {
      throw new Error("Game is not in progress.");
    } else if (error.message.includes("InvalidWinner")) {
      throw new Error("Invalid winner address.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to declare winner: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

// Event watching functions
export interface ContractEventCallbacks {
  onGameStarted?: (lobbyId: string) => void;
  onWinnerDeclared?: (lobbyId: string, winner: string) => void;
  onPrizeClaimed?: (lobbyId: string, winner: string, amount: bigint) => void;
}

export function watchLobbyEvents(
  lobbyId: string,
  callbacks: ContractEventCallbacks,
) {
  const lobbyIdBytes32 = stringToBytes32(lobbyId);
  const unwatchFunctions: (() => void)[] = [];

  // Watch GameStarted events
  if (callbacks.onGameStarted) {
    const unwatchGameStarted = wagmiWatch({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      eventName: "GameStarted",
      args: { lobbyId: lobbyIdBytes32 },
      onLogs: (logs: any[]) => {
        logs.forEach((log: any) => {
          console.log("GameStarted event received:", log);
          callbacks.onGameStarted?.(lobbyId);
        });
      },
    });
    unwatchFunctions.push(unwatchGameStarted);
  }

  // Watch WinnerDeclared events
  if (callbacks.onWinnerDeclared) {
    const unwatchWinnerDeclared = wagmiWatch({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      eventName: "WinnerDeclared",
      args: { lobbyId: lobbyIdBytes32 },
      onLogs: (logs: any[]) => {
        logs.forEach((log: any) => {
          console.log("WinnerDeclared event received:", log);
          const { winner } = log.args as { winner: string };
          callbacks.onWinnerDeclared?.(lobbyId, winner);
        });
      },
    });
    unwatchFunctions.push(unwatchWinnerDeclared);
  }

  // Watch PrizeClaimed events
  if (callbacks.onPrizeClaimed) {
    const unwatchPrizeClaimed = wagmiWatch({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      eventName: "PrizeClaimed",
      args: { lobbyId: lobbyIdBytes32 },
      onLogs: (logs: any[]) => {
        logs.forEach((log: any) => {
          console.log("PrizeClaimed event received:", log);
          const { winner, amount } = log.args as {
            winner: string;
            amount: bigint;
          };
          callbacks.onPrizeClaimed?.(lobbyId, winner, amount);
        });
      },
    });
    unwatchFunctions.push(unwatchPrizeClaimed);
  }

  // Return function to unwatch all events
  return () => {
    unwatchFunctions.forEach((unwatch) => unwatch());
  };
}

export async function startGame(
  params: StartGameParams,
): Promise<StartGameResult> {
  const { lobbyId } = params;

  // Check if wallet is connected via Privy
  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);

  console.log("Starting game for lobby:", {
    lobbyId,
    lobbyIdBytes32,
    playerAddress: walletManager.address,
  });

  try {
    const hash = await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "startGame",
      args: [lobbyIdBytes32],
      // Let wallet auto-estimate gas
    });

    console.log("Transaction submitted, polling for confirmation...", {
      txHash: hash,
      lobbyId,
    });

    // Poll for game status to change to InProgress
    const maxAttempts = 30;
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(
        `Checking if game started on-chain (attempt ${attempt}/${maxAttempts})...`,
      );

      const lobbyInfo = await getLobbyInfo(lobbyId);

      if (lobbyInfo && lobbyInfo.status === GameStatus.InProgress) {
        console.log("✅ Game started on-chain successfully!", {
          lobbyId,
          txHash: hash,
          status: GameStatus[lobbyInfo.status],
          participants: lobbyInfo.participants.length,
          attemptsTaken: attempt,
        });

        return { hash, lobbyId, playerAddress: walletManager.address! };
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    // Polling timed out
    throw new Error(
      `Transaction sent (${hash}) but game status not updated after ${(maxAttempts * pollInterval) / 1000}s. Check block explorer.`,
    );
  } catch (error: any) {
    console.error("Failed to start game:", error);

    // Handle specific contract errors
    if (error.message.includes("NotHost")) {
      throw new Error("Only the host can start the game.");
    } else if (error.message.includes("GameAlreadyStarted")) {
      throw new Error("The game has already started.");
    } else if (error.message.includes("LobbyNotFound")) {
      throw new Error("Lobby does not exist.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to start game: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

export async function cancelLobby(
  params: CancelLobbyParams,
): Promise<CancelLobbyResult> {
  const { lobbyId } = params;

  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);

  console.log("Cancelling lobby on-chain:", {
    lobbyId,
    lobbyIdBytes32,
    hostAddress: walletManager.address,
  });

  try {
    const hash = await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "cancelLobby",
      args: [lobbyIdBytes32],
    });

    console.log("Successfully cancelled lobby, transaction hash:", hash);

    return {
      hash,
      lobbyId,
      hostAddress: walletManager.address!,
    };
  } catch (error: any) {
    console.error("Failed to cancel lobby:", error);

    if (error.message.includes("NotHost")) {
      throw new Error("Only the host can cancel this lobby.");
    } else if (error.message.includes("InvalidStatus")) {
      throw new Error("Lobby cannot be cancelled in its current state.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to cancel lobby: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

export async function setAllowlistEnabled(
  params: SetAllowlistEnabledParams,
): Promise<Hash> {
  const { lobbyId, enabled } = params;
  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);

  try {
    return await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "setAllowlistEnabled",
      args: [lobbyIdBytes32, enabled],
    });
  } catch (error: any) {
    console.error("Failed to update allowlist enabled state:", error);

    if (error.message.includes("NotHost")) {
      throw new Error("Only the host can modify the allowlist.");
    } else if (error.message.includes("InvalidStatus")) {
      throw new Error("Allowlist can only be updated while the lobby is open.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to update allowlist: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

export async function addToAllowlist(
  params: AddToAllowlistParams,
): Promise<Hash> {
  const { lobbyId, addresses } = params;
  if (!addresses.length) {
    throw new Error("No addresses provided for allowlist.");
  }

  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);
  let normalizedAddresses: `0x${string}`[];

  try {
    normalizedAddresses = Array.from(
      new Set(addresses.map((address) => getAddress(address))),
    ) as `0x${string}`[];
  } catch (err: any) {
    throw new Error(`Invalid address provided: ${err?.message ?? err}`);
  }

  if (!normalizedAddresses.length) {
    throw new Error("No valid addresses provided for allowlist.");
  }

  try {
    return await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "addToAllowlist",
      args: [lobbyIdBytes32, normalizedAddresses],
    });
  } catch (error: any) {
    console.error("Failed to add addresses to allowlist:", error);

    if (error.message.includes("NotHost")) {
      throw new Error("Only the host can modify the allowlist.");
    } else if (error.message.includes("InvalidStatus")) {
      throw new Error("Allowlist can only be updated while the lobby is open.");
    } else if (error.message.includes("ZeroAddress")) {
      throw new Error("Cannot add the zero address to the allowlist.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to add to allowlist: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

export async function removeFromAllowlist(
  params: RemoveFromAllowlistParams,
): Promise<Hash> {
  const { lobbyId, addresses } = params;
  if (!addresses.length) {
    throw new Error("No addresses provided for removal.");
  }

  const walletManager = WalletManager.getInstance();
  if (!walletManager.authenticated || !walletManager.address) {
    throw new Error(
      "Please connect your wallet using the Privy wallet button.",
    );
  }

  const lobbyIdBytes32 = stringToBytes32(lobbyId);
  let normalizedAddresses: `0x${string}`[];

  try {
    normalizedAddresses = Array.from(
      new Set(addresses.map((address) => getAddress(address))),
    ) as `0x${string}`[];
  } catch (err: any) {
    throw new Error(`Invalid address provided: ${err?.message ?? err}`);
  }

  if (!normalizedAddresses.length) {
    throw new Error("No valid addresses provided for removal.");
  }

  try {
    return await wagmiWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "removeFromAllowlist",
      args: [lobbyIdBytes32, normalizedAddresses],
    });
  } catch (error: any) {
    console.error("Failed to remove addresses from allowlist:", error);

    if (error.message.includes("NotHost")) {
      throw new Error("Only the host can modify the allowlist.");
    } else if (error.message.includes("InvalidStatus")) {
      throw new Error("Allowlist can only be updated while the lobby is open.");
    } else if (error.message.includes("ZeroAddress")) {
      throw new Error("Cannot remove the zero address.");
    } else if (error.message.includes("User rejected")) {
      throw new Error("Transaction was cancelled by user.");
    } else {
      throw new Error(
        `Failed to remove from allowlist: ${error.message ?? "Unknown error"}`,
      );
    }
  }
}

/**
 * Get all public lobby IDs from the contract
 */
export async function getAllPublicLobbies(): Promise<string[]> {
  console.log("getAllPublicLobbies:", CONTRACT_ADDRESS);
  try {
    const result = (await wagmiRead({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getAllPublicLobbies",
      args: [],
    })) as `0x${string}`[];

    // Convert bytes32 array back to original string array
    return result.map((lobbyIdBytes32) => bytes32ToString(lobbyIdBytes32));
  } catch (error) {
    console.error("Error getting public lobbies:", error);
    return [];
  }
}

/**
 * Get detailed information for multiple public lobbies using multicall
 */
export async function getPublicLobbyDetails(
  lobbyIds: string[],
): Promise<PublicLobbyInfo[]> {
  if (lobbyIds.length === 0) {
    return [];
  }

  try {
    // Prepare multicall contracts array
    const contracts = lobbyIds.map((lobbyId) => ({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getLobby",
      args: [stringToBytes32(lobbyId)],
    }));

    // Execute multicall - fetch all lobby data in a single RPC call
    const results = await publicClient.multicall({
      contracts: contracts as any[],
      allowFailure: true,
    });

    // Process results
    const lobbyDetails: PublicLobbyInfo[] = [];

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const lobbyId = lobbyIds[index];

      if (result.status === "success" && result.result) {
        const [
          host,
          betAmount,
          participants,
          status,
          winner,
          totalPrize,
          wagerToken,
        ] = result.result as [
          string,
          bigint,
          string[],
          number,
          string,
          bigint,
          string,
        ];

        if (host !== ZERO_ADDRESS) {
          const tokenSymbol =
            wagerToken === ZERO_ADDRESS
              ? "ETH"
              : ((await publicClient.readContract({
                  address: wagerToken as `0x${string}`,
                  abi: ERC20_ABI,
                  functionName: "symbol",
                })) as string);

          lobbyDetails.push({
            lobbyId,
            host,
            betAmount,
            participants,
            status: status as GameStatus,
            winner,
            totalPrize,
            participantCount: participants.length,
            formattedBetAmount: formatEther(betAmount),
            wagerToken,
            wagerSymbol: tokenSymbol,
          });
        }
      } else {
        console.warn(`Failed to fetch lobby ${lobbyId}:`, result.error);
      }
    }

    return lobbyDetails;
  } catch (error) {
    console.error("Error in multicall for lobby details:", error);
    return [];
  }
}

/**
 * Get all public lobbies with their details
 */
export async function getAllPublicLobbiesWithDetails(): Promise<
  PublicLobbyInfo[]
> {
  try {
    console.log("Fetching all public lobbies...");
    const lobbyIds = await getAllPublicLobbies();

    if (lobbyIds.length === 0) {
      console.log("No public lobbies found");
      return [];
    }

    console.log(`Found ${lobbyIds.length} public lobbies, fetching details...`);
    const lobbyDetails = await getPublicLobbyDetails(lobbyIds);

    console.log(`Retrieved details for ${lobbyDetails.length} lobbies`);
    return lobbyDetails;
  } catch (error) {
    console.error("Error getting all public lobbies with details:", error);
    return [];
  }
}

/**
 * Get the count of public lobbies
 */
export async function getPublicLobbyCount(): Promise<number> {
  try {
    const result = (await wagmiRead({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getPublicLobbyCount",
      args: [],
    })) as bigint;

    return Number(result);
  } catch (error) {
    console.error("Error getting public lobby count:", error);
    return 0;
  }
}
