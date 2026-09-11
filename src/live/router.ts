/**
 * DEGEN VILLAGE — the house router.
 *
 * One Village holds agents wired to different houses at the same time, so the
 * Brain the village is handed cannot be a single vendor client. This router IS
 * a Brain: it reads `opts.provider` — which the village copies from the agent's
 * compiled config — and forwards to the adapter for that house.
 *
 * An unknown or missing provider falls back to Anthropic, which is what an
 * agent that has never been rewired is running anyway.
 */

import type { Brain, BrainOpts, Provider, Snapshot, Verdict } from "../core/types.js";
import { heuristicBrain } from "../sim/brain.js";
import { normalizeProvider } from "../core/config.js";
import { claudeBrain, type ClaudeBrainOptions } from "./brain.js";
import { grokBrain, openaiBrain, type WireBrainOptions } from "./providers.js";

export interface LiveBrainOptions {
  anthropic?: ClaudeBrainOptions;
  openai?: WireBrainOptions;
  xai?: WireBrainOptions;
  /** Applied to all three unless a per-house option overrides it. */
  shared?: WireBrainOptions;
}

export function liveBrain(options: LiveBrainOptions = {}): Brain {
  const shared = options.shared ?? {};
  const brains: Record<Provider, Brain> = {
    connectome: heuristicBrain(),
    anthropic: claudeBrain({ ...shared, ...options.anthropic }),
    openai: openaiBrain({ ...shared, ...options.openai }),
    xai: grokBrain({ ...shared, ...options.xai }),
  };

  return {
    decide(snap: Snapshot, opts: BrainOpts): Promise<Verdict> {
      return brains[normalizeProvider(opts.provider)].decide(snap, opts);
    },
  };
}
