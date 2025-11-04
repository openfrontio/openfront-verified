import { useSignMessage, useWallets } from "@privy-io/react-auth";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { WalletButtonPortal } from "./components/WalletButtonPortal";
import "./components/WalletConnect.css";
import PrivyWalletProvider from "./providers/PrivyWalletProvider";

// Track if Privy has been initialized
let privyInitialized = false;

// Initialize Privy and mount wallet UI
export function initializePrivy() {
  // Prevent multiple initializations
  if (privyInitialized) {
    console.log("[Privy] Already initialized, skipping...");
    return Promise.resolve(window.privyWallet);
  }

  // Create a container for the React app if it doesn't exist
  let privyContainer = document.getElementById("privy-wallet-root");
  if (!privyContainer) {
    privyContainer = document.createElement("div");
    privyContainer.id = "privy-wallet-root";
    document.body.appendChild(privyContainer);
  } else {
    // Clear existing content to prevent duplicates
    privyContainer.innerHTML = "";
  }

  // Create a container for the wallet button in the center with other buttons
  let walletButtonContainer = document.getElementById(
    "wallet-button-container",
  );
  if (!walletButtonContainer) {
    // Find the connect-wallet button and replace it with our container
    const connectWalletButton = document.getElementById("connect-wallet");
    if (connectWalletButton) {
      walletButtonContainer = document.createElement("div");
      walletButtonContainer.id = "wallet-button-container";
      walletButtonContainer.style.cssText = `
        width: 100%;
        margin-bottom: 1rem;
      `;
      connectWalletButton.parentNode?.insertBefore(
        walletButtonContainer,
        connectWalletButton,
      );
      connectWalletButton.remove();
    } else {
      // Fallback: add to body
      walletButtonContainer = document.createElement("div");
      walletButtonContainer.id = "wallet-button-container";
      walletButtonContainer.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 1000;
      `;
      document.body.appendChild(walletButtonContainer);
    }
  }

  // Mount a single Privy provider with wallet button and attach a non-React signer bridge
  const root = createRoot(privyContainer);
  function Bridge() {
    const { wallets } = useWallets();
    const { signMessage } = useSignMessage();

    useEffect(() => {
      window.privySignMessage = async (message: string, addr?: string) => {
        const address = addr ?? wallets[0]?.address;
        const { signature } = await signMessage({ message }, {
          address,
        } as any);
        return signature;
      };
    }, [wallets, signMessage]);
    return <WalletButtonPortal containerId="wallet-button-container" />;
  }

  root.render(
    <PrivyWalletProvider>
      <Bridge />
    </PrivyWalletProvider>,
  );

  // Mark as initialized
  privyInitialized = true;
  console.log("[Privy] Wallet infrastructure initialized");

  // Listen for wallet state changes
  window.addEventListener("wallet-state-changed", (event) => {
    const { address, authenticated, user } = (
      event as CustomEvent<{
        address?: string;
        authenticated: boolean;
        user?: any;
      }>
    ).detail;
    console.log("[Privy] Wallet state changed:", {
      address,
      authenticated,
      user,
    });

    // Dispatch custom event for game to handle
    window.dispatchEvent(
      new CustomEvent("wallet-connected", {
        detail: { address, authenticated, user },
      }),
    );
  });

  // Return a promise that resolves when Privy is ready
  return new Promise((resolve) => {
    const checkReady = () => {
      if (window.privyWallet) {
        resolve(window.privyWallet);
      } else {
        setTimeout(checkReady, 100);
      }
    };
    checkReady();
  });
}

// Export helper functions for non-React components
export const privyHelpers = {
  login: async () => {
    if (window.privyWallet) {
      return window.privyWallet.login();
    }
    throw new Error("Privy not initialized");
  },

  logout: async () => {
    if (window.privyWallet) {
      return window.privyWallet.logout();
    }
    throw new Error("Privy not initialized");
  },

  connectWallet: async () => {
    if (window.privyWallet) {
      return window.privyWallet.connectWallet();
    }
    throw new Error("Privy not initialized");
  },

  getAddress: () => {
    if (window.privyWallet) {
      return window.privyWallet.getAddress();
    }
    return undefined;
  },

  isAuthenticated: () => {
    if (window.privyWallet) {
      return window.privyWallet.isAuthenticated();
    }
    return false;
  },

  getUser: () => {
    if (window.privyWallet) {
      return window.privyWallet.getUser();
    }
    return null;
  },
};

// Auto-initialize if document is ready (but not during hot reload)
// Only initialize once to prevent multiple initializations
if (!privyInitialized && typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!privyInitialized) {
        initializePrivy();
      }
    });
  } else {
    initializePrivy();
  }
}
