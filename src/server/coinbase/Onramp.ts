import { generateJwt } from "@coinbase/cdp-sdk/auth";
import fs from "fs";
import { z } from "zod";
import { logger } from "../Logger";

const log = logger.child({ comp: "coinbase-onramp" });

interface CoinbaseCredentials {
  keyName: string;
  privateKey: string;
}

interface CoinbaseOnrampParams {
  address: string;
  asset: string;
  network: string;
  fiatAmount?: number;
  clientIp?: string;
  experience?: "buy" | "send";
  partnerUserId?: string;
}

const CREDS = loadCredentials();

function loadCredentials(): CoinbaseCredentials | null {
  try {
    const inlineJson = process.env.COINBASE_CDP_API_KEY_JSON;
    const filePath = process.env.COINBASE_CDP_API_KEY_PATH;

    let raw: string | null = null;
    if (inlineJson && inlineJson.trim().startsWith("{")) {
      raw = inlineJson.trim();
    } else if (filePath) {
      raw = fs.readFileSync(filePath, "utf8");
    }

    const parsed = raw ? JSON.parse(raw) : {};

    const keyName =
      process.env.COINBASE_CDP_API_KEY_NAME ??
      parsed.name ??
      parsed.keyName ??
      "";
    const privateKeyRaw =
      process.env.COINBASE_CDP_PRIVATE_KEY ??
      parsed.privateKey ??
      parsed.key ??
      "";

    const privateKey =
      typeof privateKeyRaw === "string" ? privateKeyRaw.trim() : "";

    if (!keyName || !privateKey) {
      if (
        process.env.COINBASE_CDP_API_KEY_JSON ||
        process.env.COINBASE_CDP_API_KEY_PATH ||
        process.env.COINBASE_CDP_PRIVATE_KEY
      ) {
        log.error("Coinbase onramp credentials incomplete", {
          hasKeyName: Boolean(keyName),
          hasPrivateKey: Boolean(privateKey),
        });
      }
      return null;
    }

    return {
      keyName,
      privateKey,
    };
  } catch (error) {
    log.error("Failed to load Coinbase credentials", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function isCoinbaseOnrampConfigured(): boolean {
  return CREDS !== null;
}

async function buildJwt(): Promise<string> {
  if (!CREDS) {
    throw new Error("Coinbase onramp is not configured");
  }

  const { privateKey, keyName } = CREDS;

  return await generateJwt({
    apiKeyId: keyName,
    apiKeySecret: privateKey,
    requestMethod: "POST",
    requestHost: "api.developer.coinbase.com",
    requestPath: "/onramp/v1/token",
    expiresIn: 120,
  });
}

const TOKEN_RESPONSE_SCHEMA = z
  .object({
    token: z.string().min(1),
  })
  .or(
    z.object({
      data: z.object({
        token: z.string().min(1),
      }),
    }),
  );

function extractToken(json: unknown): string {
  const parsed = TOKEN_RESPONSE_SCHEMA.safeParse(json);
  if (parsed.success) {
    if ("token" in parsed.data) return parsed.data.token;
    if ("data" in parsed.data) return parsed.data.data.token;
  }
  throw new Error("Coinbase response missing session token");
}

export async function createCoinbaseOnrampUrl(
  params: CoinbaseOnrampParams,
): Promise<string> {
  if (!CREDS) {
    throw new Error("Coinbase onramp is not configured");
  }

  const {
    address,
    asset,
    network,
    fiatAmount,
    clientIp,
    experience = "buy",
    partnerUserId,
  } = params;

  const jwt = await buildJwt();

  const payload: Record<string, unknown> = {
    addresses: [
      {
        address,
        blockchains: [network],
      },
    ],
  };

  if (clientIp) {
    payload.clientIp = clientIp;
  }

  if (asset) {
    payload.assets = [asset];
  }

  try {
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

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Coinbase session token request failed: ${response.status} ${response.statusText} ${text}`,
      );
    }

    const json = await response.json();
    const sessionToken = extractToken(json);

    const url = new URL("https://pay.coinbase.com/buy/select-asset");
    url.searchParams.set("sessionToken", sessionToken);
    url.searchParams.set("defaultExperience", experience);

    if (partnerUserId) {
      url.searchParams.set("partnerUserId", partnerUserId.slice(0, 48));
    }

    if (network) {
      url.searchParams.set("defaultNetwork", network);
    }

    if (asset) {
      url.searchParams.set("defaultAsset", asset);
    }

    if (typeof fiatAmount === "number" && !Number.isNaN(fiatAmount)) {
      const constrained = Math.min(Math.max(fiatAmount, 5), 25000);
      url.searchParams.set("presetFiatAmount", constrained.toFixed(2));
      url.searchParams.set("fiatCurrency", "USD");
    }

    return url.toString();
  } catch (error) {
    log.error("Failed to create Coinbase Onramp URL", {
      address,
      asset,
      network,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}
