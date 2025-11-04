import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { createPublicClient, formatEther, http } from "viem";
import { megaethTestnet } from "viem/chains";
import { getTokenBalances, requestFaucetTokens } from "../Contract";

export function WalletButton() {
  const { authenticated, user, login, logout, ready } = usePrivy();
  const { wallets } = useWallets();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFaucetPending, setIsFaucetPending] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);

  const address = wallets[0]?.address;
  const [balanceWei, setBalanceWei] = useState<bigint | undefined>(undefined);
  const [fakeUsdBalance, setFakeUsdBalance] = useState<string>("—");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const client = createPublicClient({
      chain: megaethTestnet,
      transport: http(),
    });
    async function fetchBalance() {
      try {
        if (!address) {
          if (!cancelled) {
            setBalanceWei(undefined);
            setFakeUsdBalance("—");
          }
          return;
        }
        const bal = await client.getBalance({
          address: address as `0x${string}`,
        });
        if (!cancelled) setBalanceWei(bal);
        const balances = await getTokenBalances(address as `0x${string}`);
        const fake = balances.find((b) => b.symbol === "fUSD");
        if (!cancelled && fake) {
          setFakeUsdBalance(fake.balance);
        }
      } catch (_e) {
        // Don't clear balances on error; keep last known values
        console.debug("Balance fetch failed, keeping last known values");
      }
    }
    fetchBalance();
    const id = setInterval(fetchBalance, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, refreshTrigger]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowDropdown(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleCopyAddress = async () => {
    try {
      if (!address) return;
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Copy address error:", e);
    }
  };

  const handleFaucetRequest = async () => {
    if (isFaucetPending) return;
    setIsFaucetPending(true);
    setFaucetMessage(null);
    try {
      const hash = await requestFaucetTokens();
      setFaucetMessage(`Faucet requested. Tx: ${hash.slice(0, 10)}…`);
      setTimeout(() => setRefreshTrigger((t) => t + 1), 3000);
    } catch (error: any) {
      console.error("Faucet request failed:", error);
      const message =
        error?.message ?? "Unable to request faucet tokens right now.";
      setFaucetMessage(message);
    } finally {
      setIsFaucetPending(false);
    }
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatBalance = (wei?: bigint) =>
    wei === undefined ? "—" : parseFloat(formatEther(wei)).toFixed(4);

  if (!ready) {
    return (
      <div className="wallet-button-container">
        <button className="wallet-button loading" disabled>
          <span className="spinner"></span>
          Loading...
        </button>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="wallet-button-container">
        <button className="wallet-button connect" onClick={handleLogin}>
          <>
            <svg
              className="wallet-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 18V19C21 20.1 20.1 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H19C20.1 3 21 3.9 21 5V6H12C10.89 6 10 6.9 10 8V16C10 17.1 10.89 18 12 18H21ZM12 16H22V8H12V16ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z"
                fill="currentColor"
              />
            </svg>
            Login
          </>
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-button-container">
      <button
        className="wallet-button connected"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <div className="wallet-info">
          {user?.email && (
            <span className="user-email">
              {user.email.address || String(user.email)}
            </span>
          )}
          {address && (
            <>
              <span className="wallet-address">{formatAddress(address)}</span>
              <span className="wallet-balance">
                {formatBalance(balanceWei)} ETH
              </span>
            </>
          )}
        </div>
        <svg
          className="dropdown-icon"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7 10L12 15L17 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {showDropdown && (
        <div className="wallet-dropdown">
          <div className="dropdown-content">
            <div className="dropdown-header">
              <h4>Account Details</h4>
            </div>
            {user?.email && (
              <div className="dropdown-item">
                <span className="item-label">Email:</span>
                <span className="item-value">
                  {user.email.address || String(user.email)}
                </span>
              </div>
            )}
            {address && (
              <>
                <div className="dropdown-item">
                  <span className="item-label">Address:</span>
                  <span className="item-value">{address}</span>
                </div>
                <div className="dropdown-item">
                  <span className="item-label">Balance:</span>
                  <span className="item-value">
                    {formatBalance(balanceWei)} ETH
                  </span>
                </div>
                <div className="dropdown-item">
                  <span className="item-label">USD Balance:</span>
                  <span className="item-value">{fakeUsdBalance} fUSD</span>
                </div>
              </>
            )}

            <div className="dropdown-divider"></div>

            <button
              className="logout-button"
              onClick={() =>
                window.open("https://testnet.megaeth.com", "_blank")
              }
            >
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M19 19H5V5H12V3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V12H19V19ZM14 3V5H17.59L7.76 14.83L9.17 16.24L19 6.41V10H21V3H14Z"
                  fill="currentColor"
                />
              </svg>
              Get ETH Faucet
            </button>

            <button
              className="logout-button"
              onClick={handleFaucetRequest}
              disabled={isFaucetPending}
            >
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 17.93c-3.95.49-7.43-2.54-7.92-6.49-.05-.4.27-.74.68-.74h1.02c.34 0 .63.25.68.58.3 2.19 2.3 3.85 4.54 3.59 1.93-.22 3.47-1.76 3.69-3.69.26-2.24-1.4-4.24-3.59-4.54-.33-.05-.58-.34-.58-.68V6c0-.41.34-.73.74-.68 3.95.49 6.98 3.97 6.49 7.92-.43 3.45-3.35 6.19-6.83 6.69Z"
                  fill="currentColor"
                />
              </svg>
              {isFaucetPending ? "Requesting Faucet…" : "Request 100 fUSD"}
            </button>

            {faucetMessage && (
              <div className="dropdown-item" style={{ color: "#9ccc65" }}>
                <span className="item-value">{faucetMessage}</span>
              </div>
            )}

            <div className="dropdown-divider"></div>

            <button className="logout-button" onClick={handleCopyAddress}>
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"
                  fill="currentColor"
                />
              </svg>
              {copied ? "Copied!" : "Copy Address"}
            </button>

            <div className="dropdown-divider"></div>

            <button className="logout-button" onClick={handleLogout}>
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.59L17 17L22 12L17 7ZM4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z"
                  fill="currentColor"
                />
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
