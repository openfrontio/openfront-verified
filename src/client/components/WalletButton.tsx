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
import { megaethTestnet } from "viem/chains";
import {
  getTokenBalances,
  requestFaucetTokens,
  withdrawAsset,
} from "../Contract";
import { getAuthHeader } from "../jwt";
import { getPersistentID } from "../Main";

export function WalletButton() {
  const privy = usePrivy();
  const { authenticated, user, login, logout, ready } = privy;
  const { wallets } = useWallets();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFaucetPending, setIsFaucetPending] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAssetType, setWithdrawAssetType] = useState<"ETH" | "fUSD">(
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
  const [fakeUsdBalance, setFakeUsdBalance] = useState<string>("—");
  const [fakeUsdBalanceRaw, setFakeUsdBalanceRaw] = useState<bigint>(0n);
  const [fakeUsdDecimals, setFakeUsdDecimals] = useState<number>(18);
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
            setFakeUsdBalanceRaw(0n);
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
          setFakeUsdBalanceRaw(fake.rawBalance);
          setFakeUsdDecimals(fake.decimals);
        } else if (!cancelled) {
          setFakeUsdBalance("—");
          setFakeUsdBalanceRaw(0n);
          setFakeUsdDecimals(18);
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
    return fakeUsdBalanceRaw ?? 0n;
  }, [withdrawAssetType, balanceWei, fakeUsdBalanceRaw]);

  const formattedAvailable = useMemo(() => {
    if (withdrawAssetType === "ETH") {
      return formatBalance(balanceWei);
    }
    return fakeUsdBalance;
  }, [withdrawAssetType, fakeUsdBalance, balanceWei]);

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
        parsedAmount = parseUnits(withdrawAmount, fakeUsdDecimals);
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
                    setWithdrawAssetType(e.target.value as "ETH" | "fUSD")
                  }
                  className="withdraw-modal__select"
                >
                  <option value="ETH">ETH (native)</option>
                  <option value="fUSD">fUSD (ERC-20)</option>
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
