import React, { lazy, memo, Suspense, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadBotSkin, saveBotSkin, SKIN_EVENT, skinImage } from "../../nft/skinStore.js";
import "./skins.css";
const SkinPicker = lazy(() => import("./SkinPicker.js"));

/** Public reuse point for other roster surfaces; no dependency on the terminal. */
export const BotAvatar = memo(function BotAvatar({ agentId, name, editable = false }: { agentId: string; name: string; editable?: boolean }) {
  const [skin, setSkin] = useState(() => loadBotSkin(agentId));
  const [verified, setVerified] = useState(false), [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const refresh = () => { setSkin(loadBotSkin(agentId)); setVerified(false); };
    refresh(); window.addEventListener(SKIN_EVENT, refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(SKIN_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [agentId]);
  useEffect(() => {
    if (!skin) return;
    let alive = true, running = false;
    const check = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const valid = await (await import("../../nft/skins.js")).verifyStoredSkin(skin);
        if (alive) { if (valid) setVerified(true); else saveBotSkin(agentId, null); }
      } catch { if (alive) setVerified(false); }
      finally { running = false; }
    };
    void check(); const timer = setInterval(() => void check(), 60_000);
    const focus = () => void check(); window.addEventListener("focus", focus);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [agentId, skin]);
  return <div className="dv-bot-avatar">
    <div className="dv-pfp-image" title={skin ? (verified ? "NFT ownership verified" : "Stored NFT skin · ownership verification pending") : "Default bot avatar"}>
      {skin ? <img src={skinImage(skin.tokenId)} alt={`${name} NFT avatar, resident #${skin.tokenId}`} /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
    </div>
    {editable && <div className="dv-pfp-actions"><span>{skin ? `RESIDENT #${String(skin.tokenId).padStart(2, "0")}${verified ? "" : " · CHECKING"}` : "BOT PROFILE"}</span><button onClick={() => setOpen(true)} aria-label={`Change ${name} PFP`}>CHANGE PFP</button></div>}
    {open && typeof document !== "undefined" && createPortal(<Suspense fallback={<div className="dv-toast">Opening bot wardrobe…</div>}><SkinPicker agentId={agentId} name={name} onClose={close} /></Suspense>, document.body)}
  </div>;
});
