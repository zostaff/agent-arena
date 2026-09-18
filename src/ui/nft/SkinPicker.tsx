import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import gallery from "../../nft/collection.json";
import { NFT_CHAINS, NFT_DEPLOYMENT, type Deployment } from "../../nft/config.js";
import { mintError, nftClient, walletAccount } from "../../nft/mint.js";
import { equipResident, ownedResidents } from "../../nft/skins.js";
import { loadBotSkin, saveBotSkin, skinImage } from "../../nft/skinStore.js";
import { useWallets } from "./useWallets.js";

export default function SkinPicker({ agentId, name, onClose, deployment = NFT_DEPLOYMENT }: { agentId: string; name: string; onClose: () => void; deployment?: Deployment | null }) {
  const config = deployment, wallets = useWallets();
  const [choice, setChoice] = useState("");
  const wallet = wallets.find(w => w.id === choice) ?? wallets[0];
  const client = useMemo(() => config ? nftClient(config) : null, [config]);
  const [account, setAccount] = useState<Address | null>(null), [owned, setOwned] = useState<number[]>([]);
  const [equipped, setEquipped] = useState(() => loadBotSkin(agentId));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const version = useRef(0), locked = useRef(false), root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === "Tab") {
        const buttons = [...(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select') ?? [])], first = buttons[0], last = buttons.at(-1);
        if (e.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { version.current++; document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  useEffect(() => {
    version.current++; setAccount(null); setOwned([]);
    const changed = () => { version.current++; setAccount(null); setOwned([]); setError("Wallet changed. Connect again to refresh owned skins."); };
    wallet?.provider.on?.("accountsChanged", changed); wallet?.provider.on?.("disconnect", changed);
    return () => { wallet?.provider.removeListener?.("accountsChanged", changed); wallet?.provider.removeListener?.("disconnect", changed); };
  }, [wallet?.provider]);
  const connect = async () => {
    if (!wallet || !client || !config || locked.current) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null);
    const current = ++version.current;
    try {
      const address = await walletAccount(wallet.provider, true);
      const tokens = await ownedResidents(client, config, address);
      if (await walletAccount(wallet.provider) !== address) throw new Error("Wallet changed. Connect again.");
      if (current === version.current) { setAccount(address); setOwned(tokens); }
    } catch (e) { if (current === version.current) { setOwned([]); setError(mintError(e)); } }
    finally { locked.current = false; setBusy(false); }
  };
  const equip = async (id: number) => {
    if (!wallet || !client || !config || !account || locked.current) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null); const current = version.current;
    try {
      const skin = await equipResident(client, config, wallet.provider, account, id);
      if (current !== version.current) return;
      const persisted = saveBotSkin(agentId, skin); setEquipped(skin);
      setNotice(`${gallery[id - 1].attributes[3].value} equipped on ${name}.${persisted ? " Saved in this browser." : " Session only: browser storage is unavailable."}`);
    } catch (e) { if (current === version.current) { setError(mintError(e)); setOwned([]); } }
    finally { locked.current = false; setBusy(false); }
  };
  return <section ref={root} className="dv-skin-room" role="dialog" aria-modal="true" aria-label={`${name} NFT wardrobe`}><div className="dv-skin-shell">
    <header><div><span>DEGEN VILLAGE / BOT PROFILE</span><h1>{name}'s wardrobe</h1></div><button ref={close} onClick={onClose} aria-label="Close bot wardrobe">CLOSE ×</button></header>
    <p>Give your bot a face. Equip an NFT you own as its profile picture.</p>
    <div className="dv-skin-summary"><div className="dv-pfp-image">{equipped ? <img src={skinImage(equipped.tokenId)} alt="Equipped resident" /> : <span>{name.slice(0, 2)}</span>}</div><div><strong>{equipped ? `RESIDENT #${equipped.tokenId}` : "DEFAULT AVATAR"}</strong><span>Cosmetic only · no trading advantage</span></div><button disabled={busy || !equipped} onClick={() => { saveBotSkin(agentId, null); setEquipped(null); setNotice("Default avatar restored. Your NFT stays in your wallet."); }}>RESET PFP</button></div>
    {config ? <div className="dv-skin-connect"><span>{NFT_CHAINS[config.chainId].name} · First Residents</span>{wallets.length > 1 && <select aria-label="Skin wallet" value={wallet?.id ?? ""} disabled={busy} onChange={e => setChoice(e.target.value)}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}<button disabled={busy || !wallet} onClick={() => void connect()}>{busy ? "CHECKING OWNERSHIP…" : account ? "REFRESH MY SKINS" : "CONNECT WALLET FOR SKINS"}</button>{!wallet && <p>Open this page in your wallet's browser or install a browser wallet.</p>}</div> : <div className="dv-skin-connect"><strong>FIRST RESIDENTS / PREVIEW</strong><p>Mint opens after contract deployment. Once you own a resident, you can equip it here.</p></div>}
    {notice && <p className="dv-skin-notice" role="status">{notice}</p>}{error && <p className="dv-skin-error" role="alert">{error}</p>}
    {account && !busy && !error && !owned.length && <p>This wallet has no First Residents. Open MINT to collect one when available.</p>}
    <div className="dv-skin-grid">{(config ? owned : gallery.map(g => g.id)).map(id => <button key={id} disabled={!config || busy} aria-pressed={equipped?.tokenId === id} onClick={() => void equip(id)} aria-label={`Equip ${gallery[id - 1].attributes[3].value} on ${name}`}><img src={skinImage(id)} alt={gallery[id - 1].name} /><strong>{gallery[id - 1].attributes[3].value}</strong><span>#{String(id).padStart(2, "0")} · {config ? "OWNED" : "PREVIEW"}</span></button>)}</div>
    <footer>Local bot profile · equipping costs no gas · future mined residents will use this wardrobe</footer>
  </div></section>;
}
