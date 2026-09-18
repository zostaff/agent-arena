export function frogKey(buffer: { current: string }, e: Pick<KeyboardEvent,
  "target" | "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing" | "repeat">) {
  const target = e.target as HTMLElement | null;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || target?.isContentEditable ||
    target?.closest?.('[role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])') ||
    e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat || e.key.length !== 1) {
    buffer.current = "";
    return false;
  }
  buffer.current = (buffer.current + e.key.toLowerCase()).slice(-4);
  if (buffer.current !== "frog") return false;
  buffer.current = "";
  return true;
}

export function attachFrogShortcut(target: Pick<Window, "addEventListener" | "removeEventListener">,
  buffer: { current: string }, open: () => void) {
  const listener = (event: KeyboardEvent) => { if (frogKey(buffer, event)) open(); };
  target.addEventListener("keydown", listener, { capture: true });
  return () => target.removeEventListener("keydown", listener, { capture: true });
}
