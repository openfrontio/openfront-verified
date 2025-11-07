import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  formatEther,
  http,
  isAddress,
  parseEther,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { USD_TOKEN_ADDRESS } from "../constants/Config";
import { getTokenBalances, withdrawAsset } from "../Contract";
import { getAuthHeader } from "../jwt";
import { getPersistentID } from "../Main";

export function WalletButton() {
  const privy = usePrivy();
  const { authenticated, user, login, logout, ready } = privy;
  const { wallets } = useWallets();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAssetType, setWithdrawAssetType] = useState<"ETH" | "USD">(
    "ETH",
  );
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawRecipient, setWithdrawRecipient] = useState<string>("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [fundMessage, setFundMessage] = useState<string | null>(null);
  const [isFunding, setIsFunding] = useState(false);

  const address = wallets[0]?.address;
  const [balanceWei, setBalanceWei] = useState<bigint | undefined>(undefined);
  const [usdBalance, setUsdBalance] = useState<string>("—");
  const [usdBalanceRaw, setUsdBalanceRaw] = useState<bigint>(0n);
  const [usdDecimals, setUsdDecimals] = useState<number>(6);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const client = createPublicClient({
      chain: base,
      transport: http(),
    });
    async function fetchBalance() {
      try {
        if (!address) {
          if (!cancelled) {
            setBalanceWei(undefined);
            setUsdBalance("—");
            setUsdBalanceRaw(0n);
          }
          return;
        }
        const bal = await client.getBalance({
          address: address as `0x${string}`,
        });
        if (!cancelled) setBalanceWei(bal);
        const balances = await getTokenBalances(address as `0x${string}`);
        const usd =
          balances.find((b) => b.token === USD_TOKEN_ADDRESS) ??
          balances.find((b) => b.symbol === "USDC" || b.symbol === "USD");
        if (!cancelled && usd) {
          setUsdBalance(usd.balance);
          setUsdBalanceRaw(usd.rawBalance);
          setUsdDecimals(usd.decimals);
        } else if (!cancelled) {
          setUsdBalance("—");
          setUsdBalanceRaw(0n);
          setUsdDecimals(6);
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

  const handleFundWallet = async () => {
    if (isFunding) return;
    setFundMessage(null);

    if (!address) {
      setFundMessage("Connect your wallet before funding.");
      return;
    }

    const authHeader = (() => {
      const bearer = getAuthHeader();
      if (bearer) return bearer;
      const persistent = getPersistentID();
      return persistent ? `Bearer ${persistent}` : "";
    })();
    if (!authHeader) {
      setFundMessage("Log in first so we can authorize your onramp request.");
      return;
    }

    try {
      setIsFunding(true);
      const response = await fetch("/api/onramp/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: authHeader,
        },
        body: JSON.stringify({
          asset: "USDC",
          network: "base",
          presetFiatAmount: 50,
        }),
      });

      if (response.status === 503) {
        setFundMessage(
          "Onramp server credentials missing. Ask the host to configure Coinbase CDP keys.",
        );
        return;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          text || "Failed to start Coinbase Onramp session. Check API keys.",
        );
      }

      const json = (await response.json()) as { url?: string };
      if (!json?.url) {
        throw new Error("Server did not return an onramp URL.");
      }

      window.open(json.url, "_blank", "noopener,noreferrer");
      setFundMessage(
        "Coinbase Onramp opened. Complete the flow in the new tab.",
      );
    } catch (error: any) {
      console.error("Onramp launch failed:", error);
      setFundMessage(
        error?.message ??
          "Unable to launch Coinbase Onramp. Please try again later.",
      );
    } finally {
      setIsFunding(false);
    }
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatBalance = (wei?: bigint) =>
    wei === undefined ? "—" : parseFloat(formatEther(wei)).toFixed(4);

  const availableToWithdraw = useMemo(() => {
    if (withdrawAssetType === "ETH") {
      return balanceWei ?? 0n;
    }
    return usdBalanceRaw ?? 0n;
  }, [withdrawAssetType, balanceWei, usdBalanceRaw]);

  const formattedAvailable = useMemo(() => {
    if (withdrawAssetType === "ETH") {
      return formatBalance(balanceWei);
    }
    return usdBalance;
  }, [withdrawAssetType, usdBalance, balanceWei]);

  const resetWithdrawState = () => {
    setWithdrawAmount("");
    setWithdrawRecipient("");
    setWithdrawError(null);
    setWithdrawSuccess(null);
    setIsWithdrawing(false);
  };

  const closeWithdrawModal = () => {
    resetWithdrawState();
    setIsWithdrawOpen(false);
  };

  const handleWithdraw = async () => {
    if (isWithdrawing) return;
    setWithdrawError(null);
    setWithdrawSuccess(null);

    if (!withdrawAmount.trim()) {
      setWithdrawError("Enter an amount to withdraw.");
      return;
    }

    if (!withdrawRecipient.trim()) {
      setWithdrawError("Enter a destination address.");
      return;
    }

    if (!isAddress(withdrawRecipient)) {
      setWithdrawError("Destination address is invalid.");
      return;
    }

    try {
      let parsedAmount: bigint;
      if (withdrawAssetType === "ETH") {
        parsedAmount = parseEther(withdrawAmount);
      } else {
        parsedAmount = parseUnits(withdrawAmount, usdDecimals);
      }

      if (parsedAmount <= 0n) {
        setWithdrawError("Amount must be greater than zero.");
        return;
      }

      if (parsedAmount > availableToWithdraw) {
        setWithdrawError("Amount exceeds available balance.");
        return;
      }

      setIsWithdrawing(true);
      const tx = await withdrawAsset({
        asset: withdrawAssetType,
        recipient: withdrawRecipient as `0x${string}`,
        amount: withdrawAmount,
      });
      setWithdrawSuccess(`Withdrawal submitted. Tx: ${tx.slice(0, 12)}…`);
      setTimeout(() => setRefreshTrigger((t) => t + 1), 3000);
    } catch (error: any) {
      console.error("Withdrawal failed:", error);
      setWithdrawError(error?.message ?? "Withdrawal failed. Try again.");
    } finally {
      setIsWithdrawing(false);
    }
  };

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
                  <span className="item-value">{usdBalance} USD</span>
                </div>
              </>
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

            <button
              className="logout-button fund-button"
              onClick={handleFundWallet}
              disabled={isFunding}
            >
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 4L12 20M12 20L6 14M12 20L18 14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {isFunding ? "Launching Onramp…" : "Fund Wallet (Base)"}
            </button>

            {fundMessage && (
              <div className="dropdown-item fund-message">
                <span className="item-value">{fundMessage}</span>
              </div>
            )}

            <div className="dropdown-divider"></div>

            <button
              className="logout-button withdraw-trigger"
              onClick={() => setIsWithdrawOpen(true)}
            >
              <svg
                className="logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 5V19M12 19L6 13M12 19L18 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Withdraw
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
      {isWithdrawOpen && (
        <div className="withdraw-modal">
          <div className="withdraw-modal__dialog">
            <div className="withdraw-modal__header">
              <h4>Withdraw Funds</h4>
              <button
                className="withdraw-modal__close"
                onClick={closeWithdrawModal}
                aria-label="Close withdraw modal"
              >
                ✕
              </button>
            </div>
            <div className="withdraw-modal__content">
              <p className="withdraw-modal__warning">
                ⚠️ Withdrawals execute on the MegaETH Testnet. Double-check the
                recipient address and network in your wallet before confirming.
              </p>

              <label className="withdraw-modal__label">
                Asset
                <select
                  value={withdrawAssetType}
                  onChange={(e) =>
                    setWithdrawAssetType(e.target.value as "ETH" | "USD")
                  }
                  className="withdraw-modal__select"
                >
                  <option value="ETH">ETH (native)</option>
                  <option value="USD">USD (ERC-20)</option>
                </select>
              </label>

              <label className="withdraw-modal__label">
                Amount
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.0"
                  className="withdraw-modal__input"
                />
                <span className="withdraw-modal__hint">
                  Available: {formattedAvailable} {withdrawAssetType}
                </span>
              </label>

              <label className="withdraw-modal__label">
                Destination Address
                <input
                  type="text"
                  value={withdrawRecipient}
                  onChange={(e) => setWithdrawRecipient(e.target.value)}
                  placeholder="0x..."
                  className="withdraw-modal__input"
                />
              </label>

              {withdrawError && (
                <div className="withdraw-modal__error">{withdrawError}</div>
              )}
              {withdrawSuccess && (
                <div className="withdraw-modal__success">{withdrawSuccess}</div>
              )}

              <div className="withdraw-modal__actions">
                <button
                  className="withdraw-cancel"
                  onClick={closeWithdrawModal}
                  disabled={isWithdrawing}
                >
                  Cancel
                </button>
                <button
                  className="withdraw-confirm"
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                >
                  {isWithdrawing ? "Withdrawing…" : "Confirm Withdraw"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
