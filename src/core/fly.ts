/** FlyWire reference metadata. This is not a downloaded connectome or neural solver. */
export const FLY_PROVIDER = {
  id: "connectome", label: "FLY", short: "CONNECTOME", color: "#CCFF00",
  tagline: "139,255 neurons, zero dollars",
  bias: 0.0004, thresh: 0.85, noise: 1.9, sizeMult: 0.85, holdMult: 0.55,
  flip: 0.11, rugBlind: 0.40,
  ladder: [{ minPtn: 0, id: "flywire-783", short: "FLYWIRE 783" }],
  price: { "flywire-783": { in: 0, out: 0 } },
  neurons: 139255, synapses: 50e6, pam: 15,
} as const;

// Registered after initialization; kept separate from the paid FORGE houses.
export const EASTER_EGG_PROVIDERS = { connectome: FLY_PROVIDER } as const;
export const FLY_STATS = { spd: 9, rsk: 7, ptn: 2, gas: 8 } as const;
export const FLY_ID = "fly-00";
