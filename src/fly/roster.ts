/** Additive roster deployment: uses the existing agent factory and trading loop. */
import type { Village } from "../core/village.js";
import { CLASS_STRATEGY } from "../core/brain.js";
import { FLY_STATS } from "../core/fly.js";

export const SWARM_SIZE = 4;
export const flyId = (index: number) => `fly-${String(index).padStart(2, "0")}`;

export function joinFlySwarm(village: Village) {
  const flies = [];
  for (let i = 0; i < SWARM_SIZE; i++) {
    const id = flyId(i);
    const existing = village.agents.find((a) => a.id === id || (i === 0 && a.cls === "FLY" && a.name === "FLY-00"));
    if (existing) { flies.push(existing); continue; }
    const agent = village.addAgent({
      id, cls: "FLY", name: `FLY-${String(i).padStart(2, "0")}`,
      stats: { ...FLY_STATS }, strategy: { ...CLASS_STRATEGY.FLY },
      home: { gx: 5 + i, gy: 10 }, custom: true, provider: "connectome",
    });
    // Core notifications use positive ids. Negative ids cannot collide with them.
    village.notifications.push({ id: -1 - i, agentId: id, text: "CONNECTOME ONLINE",
      kind: "info", tick: village.tick, gx: agent.gx, gy: agent.gy });
    flies.push(agent);
  }
  return flies;
}
