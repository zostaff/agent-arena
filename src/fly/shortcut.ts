/** No clock, browser storage, RNG or React state in the typed-code recognizer. */
export function flyKey(buffer: { current: string }, e: Pick<KeyboardEvent,
  "target" | "key" | "metaKey" | "ctrlKey" | "altKey">): boolean {
  const target = e.target as HTMLElement | null;
  if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable ||
      e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) {
    buffer.current = "";
    return false;
  }
  buffer.current = (buffer.current + e.key.toLowerCase()).slice(-3);
  if (buffer.current !== "fly") return false;
  buffer.current = "";
  return true;
}

export function attachFlyShortcut(target: Pick<Window, "addEventListener" | "removeEventListener">,
  buffer: { current: string }, open: () => void) {
  const handler = (e: KeyboardEvent) => { if (flyKey(buffer, e)) open(); };
  target.addEventListener("keydown", handler, { capture: true });
  return () => target.removeEventListener("keydown", handler, { capture: true });
}
