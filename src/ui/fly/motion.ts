/** Shared screen/limb/peripheral pose. Rendering never issues a trading command. */
import { finite, type AgentView } from "./state.js";
export function keyPosition(index: number) {
  const row = Math.floor(index / 12), column = index % 12;
  return { x: 494 + column * 16.5 - row * 4, y: 365 + row * 11 };
}
export function flyMotion(tick = 0, agent?: AgentView, station = 0) {
  const t = Math.max(0, finite(tick)) + station * 37;
  const engaged = Boolean(agent?.position) || agent?.state === "DECIDE" || agent?.state === "SETTLE";
  const period = engaged ? 18 : 48;
  const step = Math.floor(t / period), phase = (t % period) / period;
  const key = (step * 7 + station * 11) % 48;
  const target = keyPosition(key);
  const previous = keyPosition(((Math.max(0, step - 1) * 7 + station * 11) % 48));
  const travel = Math.min(1, phase / 0.45);
  const smooth = travel * travel * (3 - 2 * travel);
  const pressed = phase >= 0.52 && phase <= 0.76;
  const hand = { x: previous.x + (target.x - previous.x) * smooth,
    y: previous.y + (target.y - previous.y) * smooth - Math.sin(travel * Math.PI) * 24 + (pressed ? 2 : 0) };
  const mouseX = 724 + Math.sin(t * 0.035) * 17 + Math.sin(t * 0.011) * 7;
  const mouseY = 408 + Math.cos(t * 0.029) * 8;
  return { t, engaged, key, pressed, hand, mouseX, mouseY,
    click: engaged && Math.sin(t * 0.19) > 0.8,
    cursorX: 210 + (mouseX - 724) * 3.5, cursorY: 92 + (mouseY - 408) * 4,
    bob: Math.sin(t * 0.065) * 2.3,
    head: Math.sin(t * 0.025) * 3 + (engaged ? 3 : 0),
    antenna: Math.sin(t * 0.13) * 7,
  };
}
