/**
 * Convert a string to bytes32 format for smart contract interaction
 */
export function stringToBytes32(str: string): `0x${string}` {
  if (str.startsWith("0x") && str.length === 66) {
    return str as `0x${string}`;
  }

  const bytes = new TextEncoder().encode(str);

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return ("0x" + hex.padEnd(64, "0")) as `0x${string}`;
}

/**
 * Convert bytes32 back to string
 */
export function bytes32ToString(bytes32: string): string {
  const hex = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;

  const trimmed = hex.replace(/0+$/, "");

  const bytes: number[] = [];
  for (let i = 0; i < trimmed.length; i += 2) {
    bytes.push(parseInt(trimmed.substr(i, 2), 16));
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Format ether value for display
 */
export function formatEther(wei: bigint, decimals: number = 4): string {
  const etherValue = Number(wei) / 1e18;
  return etherValue.toFixed(decimals);
}

/**
 * Parse ether string to wei bigint
 */
export function parseEther(ether: string): bigint {
  const value = parseFloat(ether);
  return BigInt(Math.floor(value * 1e18));
}
