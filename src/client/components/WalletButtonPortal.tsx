import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { WalletButton } from "./WalletButton";

interface WalletButtonPortalProps {
  containerId: string;
}

export function WalletButtonPortal({ containerId }: WalletButtonPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = document.getElementById(containerId);
    setContainer(element);
  }, [containerId]);

  if (!container) {
    return null;
  }

  return ReactDOM.createPortal(<WalletButton />, container);
}
