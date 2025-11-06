import "dotenv/config";

import { generateJwt } from "@coinbase/cdp-sdk/auth";

type Args = {
  address: string;
  network: string;
  asset: string;
  fiatAmount?: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};
  for (const arg of args) {
    const [key, value] = arg.split("=");
    if (!key || value === undefined) {
      throw new Error(
        `Invalid arg "${arg}". Use address=0x..., network=base, asset=USDC, fiatAmount=50`,
      );
    }
    params[key] = value;
  }

  const { address, network, asset, fiatAmount } = params;
  if (!address) throw new Error('Missing required arg "address=0x..."');
  if (!network) throw new Error('Missing required arg "network=base"');
  if (!asset) throw new Error('Missing required arg "asset=USDC"');

  return {
    address,
    network,
    asset,
    fiatAmount: fiatAmount ? Number(fiatAmount) : undefined,
  };
}

function loadRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value.trim();
}

async function run() {
  const args = parseArgs();

  const apiKeyId = loadRequiredEnv("COINBASE_CDP_API_KEY_NAME");
  // SDK expects raw base64 (not PEM), so try the original raw key if available
  const apiKeySecret =
    process.env.COINBASE_CDP_PRIVATE_KEY_RAW?.trim() ??
    loadRequiredEnv("COINBASE_CDP_PRIVATE_KEY");

  console.log("Using CDP SDK to generate JWT...");
  console.log("API Key ID:", apiKeyId);
  console.log("API Key Secret preview:", apiKeySecret.slice(0, 50) + "...");

  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "POST",
    requestHost: "api.developer.coinbase.com",
    requestPath: "/onramp/v1/token",
    expiresIn: 120,
  });

  console.log("JWT preview:", jwt.slice(0, 80) + "...");

  const payload: Record<string, unknown> = {
    addresses: [
      {
        address: args.address,
        blockchains: [args.network],
      },
    ],
  };

  if (args.asset) {
    payload.assets = [args.asset];
  }

  if (args.fiatAmount) {
    payload.presetFiatAmount = args.fiatAmount;
  }

  console.log("Submitting payload:", JSON.stringify(payload, null, 2));

  const response = await fetch(
    "https://api.developer.coinbase.com/onramp/v1/token",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  console.log("Response status:", response.status, response.statusText);
  const text = await response.text();
  console.log("Response body:", text);

  if (response.ok) {
    const json = JSON.parse(text);
    const token = json?.token ?? json?.data?.token ?? "NO TOKEN IN RESPONSE";
    console.log("\n✅ Session token:", token);
  } else {
    console.error(
      "\n❌ Coinbase rejected the request. Check your credentials.",
    );
  }
}

run().catch((err) => {
  console.error("coinbaseOnrampTestSDK failed:", err);
  process.exit(1);
});
