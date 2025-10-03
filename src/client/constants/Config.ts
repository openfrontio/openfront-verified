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

export const CONTRACT_ADDRESS = (resolveEnv("CONTRACT_ADDRESS") ??
  "0x5ebA1722f8Af2B97f90AfDe20218234b5EEe6E02") as `0x${string}`;
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
