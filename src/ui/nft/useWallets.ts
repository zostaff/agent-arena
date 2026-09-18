import { useEffect, useState } from "react";
import type { BrowserWallet } from "../../nft/mint.js";
type WalletOption = { id: string; name: string; provider: BrowserWallet };
export function useWallets() {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  useEffect(() => {
    const receive = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.info || typeof detail.info.uuid !== "string" || typeof detail.info.name !== "string" || typeof detail.provider?.request !== "function") return;
      setWallets(old => old.some(w => w.id === detail.info.uuid) ? old : [...old.filter(w => w.id !== "injected"), { id: detail.info.uuid, name: detail.info.name.slice(0, 60), provider: detail.provider }]);
    };
    const injected = (window as Window & { ethereum?: BrowserWallet }).ethereum;
    if (injected?.request) setWallets([{ id: "injected", name: "Browser wallet", provider: injected }]);
    window.addEventListener("eip6963:announceProvider", receive);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", receive);
  }, []);
  return wallets;
}
