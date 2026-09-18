import React, { lazy, Suspense, useCallback, useState } from "react";
import { createPortal } from "react-dom";
const Collection = lazy(() => import("./Collection.js"));
export function CollectionEntry() {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("collection") === "1");
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button className="dv-btn dv-btn-on" onClick={() => setOpen(true)}>MINT</button>
    {open && typeof document !== "undefined" && createPortal(<Suspense fallback={<div className="dv-toast" role="status">Opening collection…</div>}><Collection onClose={close} /></Suspense>, document.body)}
  </>;
}
