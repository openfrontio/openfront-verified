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
    console.log("✅ [walletLink] Starting wallet link process", { address });

    const authHeader = getAuthOrPersistentHeader();
    if (!authHeader) {
      console.error(
        "❌ [walletLink] No authorization header - cannot link wallet",
      );
      console.error("   No persistent ID cookie found!");
      alert(
        "⚠️ Wallet linking failed: No persistent ID. Please refresh the page.",
      );
      return;
    }

    const persistentId = getPersistentIdFromCookie();
    console.log("[walletLink] Using persistent ID:", persistentId);

    // Check existing link
    console.log("[walletLink] Checking if wallet already linked...");
    const me = await fetchJson<{ address: string | null }>(`/api/wallet/me`, {
      headers: { authorization: authHeader },
    });
    console.log("[walletLink] GET /api/wallet/me response:", me);

    if (me?.address && me.address.toLowerCase() === address.toLowerCase()) {
      console.log("✅ [walletLink] Wallet already linked!");
      return;
    }

    console.log("[walletLink] Wallet not linked yet, requesting nonce...");
    const nonceResp = await fetchJson<{ nonce: string; expiresAt: number }>(
      `/api/wallet/nonce`,
      { headers: { authorization: authHeader } },
    );
    console.log("[walletLink] Got nonce:", nonceResp.nonce);

    const message = buildLinkMessage(address, nonceResp.nonce);
    console.log("[walletLink] Message to sign:", message);

    // Prefer Privy signMessage hook if exposed by InitPrivy
    let signature: string | undefined;
    if (typeof window.privySignMessage === "function") {
      console.log("[walletLink] Signing via privySignMessage...");
      signature = await window.privySignMessage(message, address);
    } else {
      // Fallback to embedded provider personal_sign
      const provider = await window.privyWallet?.getEmbeddedProvider?.();
      if (!provider) {
        console.error("❌ [walletLink] Embedded provider unavailable");
        alert(
          "⚠️ Wallet linking failed: Provider unavailable. Please reconnect your wallet.",
        );
        return;
      }
      console.log("[walletLink] Requesting signature via personal_sign...");
      signature = await provider.request({
        method: "personal_sign",
        params: [message, address],
      });
    }

    if (!signature) {
      console.error("❌ [walletLink] No signature obtained");
      alert("⚠️ Wallet linking failed: Signature rejected.");
      return;
    }

    console.log(
      "[walletLink] Signature obtained:",
      signature.slice(0, 10) + "...",
    );

    console.log("[walletLink] Submitting link to server...");
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
    console.log("[walletLink] POST /api/wallet/link response:", {
      status: resp.status,
      ok: resp.ok,
      text: text?.slice(0, 120),
    });

    if (!resp.ok) {
      console.error("❌ [walletLink] Server rejected link request");
      throw new Error(text || `Link failed: ${resp.status}`);
    }

    console.log("✅ [walletLink] WALLET LINKED SUCCESSFULLY!", {
      address,
      persistentId,
    });

    // Verify the link worked
    const verify = await fetchJson<{ address: string | null }>(
      `/api/wallet/me`,
      {
        headers: { authorization: authHeader },
      },
    );

    if (verify?.address?.toLowerCase() === address.toLowerCase()) {
      console.log("✅ [walletLink] Link verified on server!");
    } else {
      console.error("❌ [walletLink] Link verification FAILED!", {
        expected: address,
        got: verify?.address,
      });
    }
  } catch (e) {
    console.error("❌ [walletLink] FAILED:", e);
    console.error("   Stack:", e instanceof Error ? e.stack : "N/A");
    alert(
      `⚠️ Wallet linking failed: ${e instanceof Error ? e.message : String(e)}\n\nYou won't be able to claim tournament prizes. Please try reconnecting your wallet.`,
    );
  }
}
