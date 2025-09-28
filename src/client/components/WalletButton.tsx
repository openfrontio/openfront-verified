import { useFundWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { createPublicClient, formatEther, http } from "viem";
import { baseSepolia } from "viem/chains";

export function WalletButton() {
  const { authenticated, user, login, logout, ready } = usePrivy();
  const { wallets } = useWallets();
  const [showDropdown, setShowDropdown] = useState(false);

  const address = wallets[0]?.address;
  const [balanceWei, setBalanceWei] = useState<bigint | undefined>(undefined);
  const { fundWallet } = useFundWallet();

  useEffect(() => {
    let cancelled = false;
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    async function fetchBalance() {
      try {
        if (!address) {
          if (!cancelled) setBalanceWei(undefined);
          return;
        }
        const bal = await client.getBalance({
          address: address as `0x${string}`,
        });
        if (!cancelled) setBalanceWei(bal);
      } catch (_e) {
        if (!cancelled) setBalanceWei(undefined);
      }
    }
    fetchBalance();
    const id = setInterval(fetchBalance, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

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

  const handleFund = async () => {
    try {
      if (!address) return;
      try {
        await navigator.clipboard.writeText(address);
      } catch (e) {
        /* ignore clipboard errors */
      }
      await fundWallet({
        address,
        chain: baseSepolia,
        amount: "0.01",
        uiConfig: {
          receiveFundsTitle: "Fund your wallet",
          receiveFundsSubtitle:
            "Scan the code or copy your address to receive ETH on Base Sepolia.",
        },
      } as any);
    } catch (e) {
      console.error("Fund wallet error:", e);
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
            Wallet Login
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
              </>
            )}

            <div className="dropdown-divider"></div>

            <button className="logout-button" onClick={handleFund}>
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 1L9 4H6C4.9 4 4 4.9 4 6V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V6C20 4.9 19.1 4 18 4H15L12 1Z"
                  fill="currentColor"
                />
              </svg>
              Add Funds
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
