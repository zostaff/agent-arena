import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { attachSpiderShortcut } from "../../spider/shortcut.js";
const SpiderRoom = lazy(() => import("./SpiderRoom.js"));
export function SpiderEntry() {
  const [open, setOpen] = useState(false), buffer = useRef("");
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => attachSpiderShortcut(window, buffer, () => setOpen(true)), []);
  return <><button className="dv-btn dv-btn-primary" onClick={() => setOpen(true)}>SPIDER</button>{open && createPortal(<Suspense fallback={<div className="dv-toast" role="status">Opening spider web…</div>}><SpiderRoom onClose={close} /></Suspense>, document.body)}</>;
}
