import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import gallery from "../../nft/collection.json";
import { NFT_CHAINS, NFT_DEPLOYMENT, type Deployment } from "../../nft/config.js";
import { confirmMint, mintError, nftClient, pendingMint, readMintState, savePending, submitMint, switchNftChain, walletAccount, walletChain, SettledMintError,
  type BrowserWallet, type MintState, type PendingMint } from "../../nft/mint.js";
import "./collection.css";
import { useWallets } from "./useWallets.js";

const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const imagePath = (id: number) => `${import.meta.env.BASE_URL}nft/${id}.svg`;


function MintPanel({ config, onBusy }: { config: Deployment; onBusy: (busy: boolean) => void }) {
  const client = useMemo(() => nftClient(config), [config]);
  const wallets = useWallets();
  const [choice, setChoice] = useState("");
  const selected = wallets.find(w => w.id === choice) ?? wallets[0];
  const [connected, setConnected] = useState<BrowserWallet | null>(null);
  const [account, setAccount] = useState<Address | null>(null), [chain, setChain] = useState<number | null>(null);
  const [state, setState] = useState<MintState | null>(null), [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false), locked = useRef(false);
  const [pending, setPending] = useState<PendingMint | null>(() => pendingMint(config));
  const [minted, setMinted] = useState<{ id: number; hash: Hex } | null>(null);
  const generation = useRef(0), mounted = useRef(true);
  const network = NFT_CHAINS[config.chainId];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusy(working); }, [working, onBusy]);
  useEffect(() => {
    let alive = true, running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try { const fresh = await readMintState(client, config, account ?? undefined); if (alive) setState(fresh); }
      catch (e) { if (alive) { setState(null); setError(mintError(e)); } }
      finally { running = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => { alive = false; clearInterval(timer); };
  }, [client, config, account]);
  useEffect(() => {
    if (!connected) return;
    const changed = () => { generation.current++; setAccount(null); setChain(null); setState(null); setError("Wallet account or network changed. Connect again to refresh your mint eligibility."); };
    connected.on?.("accountsChanged", changed); connected.on?.("chainChanged", changed); connected.on?.("disconnect", changed);
    return () => { connected.removeListener?.("accountsChanged", changed); connected.removeListener?.("chainChanged", changed); connected.removeListener?.("disconnect", changed); };
  }, [connected]);
  const action = async (job: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setWorking(true); setError(null);
    try { await job(); }
    catch (e) { if (mounted.current) setError(mintError(e)); }
    finally { locked.current = false; if (mounted.current) setWorking(false); }
  };
  const connect = () => action(async () => {
    if (!selected) throw new Error("Open this page in a browser with an Ethereum wallet, or in your wallet's browser.");
    const version = ++generation.current;
    const next = await walletAccount(selected.provider, true), nextChain = await walletChain(selected.provider);
    if (version !== generation.current || !mounted.current) return;
    setConnected(selected.provider); setAccount(next); setChain(nextChain);
    setState(await readMintState(client, config, next));
  });
  const confirm = async (transaction: PendingMint) => {
    let result;
    try { result = await confirmMint(client, config, transaction.hash, transaction.account); }
    catch (e) { if (e instanceof SettledMintError) { savePending(null); setPending(null); } throw e; }
    savePending(null); setPending(null); setMinted(result);
    // Mint success is established by the receipt, even if the next read fails.
    try { setState(await readMintState(client, config, account ?? undefined)); }
    catch { setState(null); }
  };
  const mint = () => action(async () => {
    if (!connected || !account || pending) throw new Error("Connect your wallet and resolve any pending mint first.");
    const hash = await submitMint(client, connected, config, account);
    const transaction = { ...config, hash, account };
    setPending(transaction); savePending(transaction);
    await confirm(transaction);
  });
  const switchNetwork = () => action(async () => {
    if (!connected) return;
    await switchNftChain(connected, config);
    const next = await walletAccount(connected);
    setAccount(next); setChain(await walletChain(connected));
    setState(await readMintState(client, config, next));
  });
  return <>
    <div className="nft-mint-count"><strong>{state ? state.supply : "—"}<small> / 30 minted</small></strong><span>{network.testnet ? "TESTNET" : "MAINNET"}</span></div>
    <div className="nft-progress"><span style={{ width: `${(state?.supply ?? 0) / 30 * 100}%` }} /></div>
    <p className="nft-rule">0 ETH mint price · network gas only<br />One lifetime mint per address · assigned in order</p>
    {minted && <div className="nft-success" role="status"><strong>Resident #{minted.id} is yours.</strong><a href={`${network.blockExplorers.default.url}/tx/${minted.hash}`} target="_blank" rel="noreferrer">View confirmed mint ↗</a></div>}
    {pending && <div className="nft-pending" role="status"><p>Mint submitted from {shorten(pending.account)}. Awaiting a matching successful receipt.</p><a href={`${network.blockExplorers.default.url}/tx/${pending.hash}`} target="_blank" rel="noreferrer">Check transaction ↗</a><button disabled={working} onClick={() => void action(() => confirm(pending))}>CHECK CONFIRMATION</button></div>}
    {!pending && !account && <>
      {wallets.length > 1 && <label className="nft-wallet-label">Wallet<select value={selected?.id ?? ""} onChange={e => setChoice(e.target.value)}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
      <button className="nft-primary" disabled={working || !state} onClick={() => void connect()}>{working ? "CHECK YOUR WALLET…" : "CONNECT WALLET"}</button>
      {!wallets.length && <p className="nft-small">Use an Ethereum browser wallet or open this page in your wallet's browser.</p>}
    </>}
    {!pending && account && <>
      <div className="nft-account"><span>{shorten(account)}</span><button disabled={working} onClick={() => { generation.current++; setAccount(null); setChain(null); setConnected(null); }}>DISCONNECT</button></div>
      {chain !== config.chainId ? <button className="nft-primary" disabled={working} onClick={() => void switchNetwork()}>SWITCH TO {network.name.toUpperCase()}</button> :
        <button className="nft-primary" disabled={working || !state || state.claimed || state.supply >= 30} onClick={() => void mint()}>{working ? "CHECK YOUR WALLET…" : state?.claimed ? "THIS ADDRESS HAS MINTED" : state?.supply === 30 ? "ALL RESIDENTS MINTED" : "MINT MY RESIDENT · 0 ETH"}</button>}
    </>}
    {error && <p className="nft-error" role="alert">{error}</p>}
    <a className="nft-contract" href={`${network.blockExplorers.default.url}/address/${config.address}`} target="_blank" rel="noreferrer">{network.name} · {shorten(config.address)} ↗</a>
  </>;
}

export default function Collection({ onClose, deployment = NFT_DEPLOYMENT }: { onClose: () => void; deployment?: Deployment | null }) {
  const [filter, setFilter] = useState("All"), [busy, setBusy] = useState(false), [featured, setFeatured] = useState(2);
  const root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), busyRef = useRef(busy);
  busyRef.current = busy;
  const onBusy = useCallback((value: boolean) => setBusy(value), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (!busyRef.current) onClose(); }
      if (e.key === "Tab") {
        const elements = [...(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select:not([disabled])') ?? [])];
        const first = elements[0], last = elements.at(-1);
        if (e.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", listener, true);
    return () => { document.removeEventListener("keydown", listener, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  const pieces = gallery.filter(item => filter === "All" || item.attributes[0].value === filter);
  return <section ref={root} className="nft-room" role="dialog" aria-modal="true" aria-label="First Residents collection">
    <div className="nft-shell"><header className="nft-header"><div>DEGEN VILLAGE <span>/ COLLECTION 001</span></div><button ref={close} disabled={busy} onClick={onClose} aria-label="Close collection">CLOSE ×</button></header>
      <div className="nft-hero"><div className="nft-copy"><span className="nft-eyebrow">30 RESIDENTS. ONE SMALL VILLAGE.</span><h1>The first<br /><em>residents.</em></h1><p>Fifteen restless flies. Fifteen patient frogs.<br />Collect a resident. Give your bot a face.</p><div className="nft-chips"><span>30 TOTAL</span><span>FREE MINT</span><span>ART ON-CHAIN</span></div>
        <div className="nft-mint-panel">{deployment ? <MintPanel config={deployment} onBusy={onBusy} /> : <><span className="nft-eyebrow">COLLECTION PREVIEW</span><h2>Meet them before they move in.</h2><p>Mint price: <strong>0 ETH</strong>. You pay network gas.<br />One mint per address on Robinhood Chain.</p><button className="nft-primary" disabled>MINT OPENS AFTER CONTRACT DEPLOYMENT</button><p className="nft-small">The collection contract has not been published yet. Equip owned residents as bot PFPs from CHANGE PFP in the bot profile.</p></>}</div>
      </div><div className="nft-feature"><img src={imagePath(featured)} alt={gallery[featured - 1].name} /><span>ORIGINAL RESIDENT / #{featured.toString().padStart(2, "0")}</span></div></div>
      <div className="nft-gallery-heading"><div><span className="nft-eyebrow">THE COMPLETE NEIGHBOURHOOD</span><h2>Find your kind of weird.</h2></div><div className="nft-filters">{["All", "Fly", "Frog"].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "All" ? "ALL 30" : value === "Fly" ? "15 FLIES" : "15 FROGS"}</button>)}</div></div>
      <div className="nft-gallery">{pieces.map(item => <button className="nft-card" key={item.id} onClick={() => { setFeatured(item.id); root.current?.scrollTo({ top: 0, behavior: "instant" }); }} aria-label={`Preview ${item.name}`}>
        <img src={imagePath(item.id)} loading="lazy" alt={item.name} /><div><strong>{item.attributes[3].value}</strong><span>#{item.id.toString().padStart(2, "0")}</span></div><p>{item.attributes.find(trait => trait.trait_type === "Expression")?.value} / {item.attributes[2].value}</p></button>)}</div>
      <footer className="nft-footer"><span>A game souvenir. The village is free to play.</span><span>Free mint · gas paid in ETH · 30 maximum</span></footer>
    </div>
  </section>;
}
