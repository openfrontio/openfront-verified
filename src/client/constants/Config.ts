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
  "0x6c7798D58e7851c70FBaAb31F5c9faD37bf2a075") as `0x${string}`;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;
