function resolveEnv(key: string): string | undefined {
  try {
    // Guarded access for webpack/browser
    const maybeProcess: any =
      typeof process !== "undefined" ? process : undefined;
    const fromProcess = maybeProcess?.env?.[key];
    const fromGlobal = (globalThis as any)?.[key];
    return (fromProcess ?? fromGlobal) as string | undefined;
  } catch {
    return undefined;
  }
}

export const CONTRACT_ADDRESS = (
  typeof process !== "undefined" && process.env?.CONTRACT_ADDRESS
    ? (process.env.CONTRACT_ADDRESS as `0x${string}`)
    : "0x89F80517908556a9C1D165fe34bD6DbCD91D0762"
) as `0x${string}`;

export const USD_TOKEN_ADDRESS = (
  typeof process !== "undefined" && process.env?.USD_TOKEN_ADDRESS
    ? (process.env.USD_TOKEN_ADDRESS as `0x${string}`)
    : ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`)
) as `0x${string}`;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

/**
 * Check if tournaments are properly configured
 * Returns false if contract address is missing or zero address
 */
export function areTournamentsEnabled(): boolean {
  return (
    CONTRACT_ADDRESS !== ZERO_ADDRESS &&
    CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000"
  );
}

/**
 * Log the current blockchain configuration to console
 */
export function logBlockchainConfig(): void {
  console.log("[Config] Blockchain Configuration:", {
    contractAddress: CONTRACT_ADDRESS,
    isZeroAddress: CONTRACT_ADDRESS === ZERO_ADDRESS,
    tournamentsEnabled: areTournamentsEnabled(),
    isLocalhost: window.location.hostname === "localhost",
    environment: resolveEnv("GAME_ENV") ?? "production",
  });

  if (!areTournamentsEnabled()) {
    console.warn(
      "⚠️ [Config] Tournaments DISABLED - CONTRACT_ADDRESS not configured or is zero address",
    );
    console.warn(
      "   Games will work, but you cannot create tournaments or claim prizes.",
    );
  }
}
