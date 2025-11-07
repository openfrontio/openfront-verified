import {
  PrivyProvider,
  usePrivy,
  useSendTransaction,
  useWallets,
} from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect } from "react";
import { base } from "viem/chains";
import { WalletManager } from "../Wallet";
import { linkWalletIfNeeded } from "../utilities/walletLink";

// Create QueryClient for TanStack Query
const queryClient = new QueryClient();

// Privy configuration
const privyConfig = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users" as const,
    },
  },
  loginMethods: ["email" as const],
  walletChains: [base],
  externalWallets: {
    coinbaseWallet: undefined,
    metamask: undefined,
    rainbow: undefined,
    walletConnect: undefined,
  },
  appearance: {
    theme: "dark" as const,
    showWalletLoginFirst: true,
    accentColor: "#6366f1" as `#${string}`,
    logo: undefined,
  },
  defaultChain: base,
  supportedChains: [base],
  accountLinking: {
    prompt: "never" as const,
  },
  modal: {
    showWalletLoginFirst: true,
    embeddedWalletsOnly: true,
  },
  autoConnect: false,
  onboarding: { enabled: true } as any,
};

// Inner component that uses Privy hooks
function WalletStateSync() {
  const { authenticated, user, login, logout, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const embedded =
    wallets.find((w) => (w as any)?.walletClientType === "privy") ?? wallets[0];
  const address = embedded?.address;
  const { sendTransaction } = useSendTransaction();

  // Sync wallet state with the WalletManager
  useEffect(() => {
    WalletManager.getInstance().updateState({
      address: address,
      authenticated: authenticated,
      user: user,
    });
    if (authenticated && address) {
      linkWalletIfNeeded(address);
    }
  }, [address, authenticated, user]);

  // Expose Privy helpers to non-React modules
  useEffect(() => {
    window.privyWallet = {
      login: async () => {
        try {
          await login();
        } catch (error) {
          console.error("Login failed:", error);
        }
      },
      logout: async () => {
        try {
          await logout();
        } catch (error) {
          console.error("Logout failed:", error);
        }
      },
      connectWallet: async () => {
        try {
          await connectWallet({ avoidExternalWallets: true } as any);
        } catch (error) {
          console.error("Connect wallet failed:", error);
        }
      },
      getAddress: () => address,
      isAuthenticated: () => authenticated,
      getUser: () => user,
      getEmbeddedProvider: async () => embedded?.getEthereumProvider(),
      sendSponsoredTransaction: async (tx: {
        to?: `0x${string}`;
        data?: `0x${string}`;
        value?: bigint;
        gas?: bigint;
      }) => {
        if (!embedded) {
          throw new Error("Embedded Privy wallet unavailable");
        }

        const request: any = { wallet: embedded };

        if (tx.to) request.to = tx.to;
        if (typeof tx.value !== "undefined") request.value = tx.value;
        if (tx.data) request.data = tx.data;
        if (typeof tx.gas !== "undefined") request.gas = tx.gas;

        const { hash } = await sendTransaction(request, {
          sponsor: true,
        });

        return hash;
      },
    };

    // Dispatch custom event when wallet state changes
    window.dispatchEvent(
      new CustomEvent("wallet-state-changed", {
        detail: { address, authenticated, user },
      }),
    );
  }, [
    embedded,
    address,
    authenticated,
    user,
    login,
    logout,
    connectWallet,
    sendTransaction,
  ]);

  return null;
}

// Removed wagmi-based game contract hooks – writes will use viem with embedded provider

// Main provider component
export default function PrivyWalletProvider({
  children,
}: {
  children?: ReactNode;
}) {
  // Support DefinePlugin-injected globals
  const appId =
    (process.env.PRIVY_APP_ID as string | undefined) ??
    (typeof __PRIVY_APP_ID__ !== "undefined" ? __PRIVY_APP_ID__ : "") ??
    "";

  if (!appId) {
    console.error(
      "[Privy] Missing PRIVY_APP_ID. Ensure it is set and webpack dev server was restarted.",
    );
    // Return children without Privy wrapper if no app ID
    return <>{children}</>;
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletStateSync />
        {children}
      </QueryClientProvider>
    </PrivyProvider>
  );
}

// Type declarations for window object
declare global {
  interface Window {
    privyWallet?: {
      login: () => Promise<void>;
      logout: () => Promise<void>;
      connectWallet: () => Promise<void>;
      getAddress: () => string | undefined;
      isAuthenticated: () => boolean;
      getUser: () => any;
      getEmbeddedProvider: () => Promise<any | undefined>;
      sendSponsoredTransaction?: (tx: {
        to?: `0x${string}`;
        data?: `0x${string}`;
        value?: bigint;
        gas?: bigint;
      }) => Promise<`0x${string}`>;
    };
  }
}
