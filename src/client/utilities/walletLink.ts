import { getAuthHeader } from "../jwt";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.warn("walletLink fetch error", { url, status: resp.status, text });
    throw new Error(`${resp.status} ${resp.statusText}`);
  }
  return (await resp.json()) as T;
}

function buildLinkMessage(address: string, nonce: string): string {
  const domain = window.location.host;
  const ts = new Date().toISOString();
  return [
    "Openfront wallet link",
    `Domain: ${domain}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${ts}`,
  ].join("\n");
}

function getPersistentIdFromCookie(): string | null {
  const COOKIE_NAME = "player_persistent_id";
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.split("=").map((c) => c.trim());
    if (cookieName === COOKIE_NAME) return cookieValue ?? null;
  }
  return null;
}

function getAuthOrPersistentHeader(): string {
  const jwt = getAuthHeader();
  if (jwt) return jwt;
  const pid = getPersistentIdFromCookie();
  return pid ? `Bearer ${pid}` : "";
}

// Runtime bridge so non-React modules can call Privy hooks functionality
// In InitPrivy.tsx, we already mount Privy and can attach a signer if desired.
declare global {
  interface Window {
    privySignMessage?: (message: string, addr?: string) => Promise<string>;
  }
}

export async function linkWalletIfNeeded(address: string): Promise<void> {
  try {
    console.log("[walletLink] start", { address });
    const authHeader = getAuthOrPersistentHeader();
    if (!authHeader) {
      console.warn(
        "[walletLink] no Authorization (JWT or persistent id) available; skipping",
      );
      return;
    }
    // Check existing link
    const me = await fetchJson<{ address: string | null }>(`/api/wallet/me`, {
      headers: { authorization: authHeader },
    });
    console.log("[walletLink] GET /me", me);
    if (me?.address && me.address.toLowerCase() === address.toLowerCase()) {
      console.log("[walletLink] already linked");
      return;
    }

    const nonceResp = await fetchJson<{ nonce: string; expiresAt: number }>(
      `/api/wallet/nonce`,
      { headers: { authorization: authHeader } },
    );
    console.log("[walletLink] GET /nonce", nonceResp);
    const message = buildLinkMessage(address, nonceResp.nonce);

    // Prefer Privy signMessage hook if exposed by InitPrivy
    let signature: string | undefined;
    if (typeof window.privySignMessage === "function") {
      console.log("[walletLink] signing via privySignMessage");
      signature = await window.privySignMessage(message, address);
    } else {
      // Fallback to embedded provider personal_sign
      const provider = await window.privyWallet?.getEmbeddedProvider?.();
      if (!provider) {
        console.warn("[walletLink] embedded provider unavailable");
        return;
      }
      console.log("[walletLink] requesting personal_sign (fallback)");
      signature = await provider.request({
        method: "personal_sign",
        params: [message, address],
      });
    }
    console.log("[walletLink] signed", {
      signature: signature?.slice(0, 10) + "…",
    });

    const resp = await fetch(`/api/wallet/link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: authHeader,
      },
      body: JSON.stringify({
        address,
        message,
        signature,
        nonce: nonceResp.nonce,
      }),
    });
    const text = await resp.text().catch(() => "");
    console.log("[walletLink] POST /link", {
      status: resp.status,
      text: text?.slice(0, 120),
    });
    if (!resp.ok) throw new Error(text || `link failed: ${resp.status}`);
  } catch (e) {
    console.error("[walletLink] failed", e);
  }
}
