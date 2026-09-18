export interface BotSkin {
  version: 1;
  collection: "first-residents";
  chainId: 4663 | 46630;
  contract: string;
  tokenId: number;
  owner: string;
}
export const SKIN_KEY = "dv_bot_pfp_v1";
export const SKIN_EVENT = "dv-bot-pfp-change";
let memory: Record<string, BotSkin> = {};
let sessionOnly = false;
const address = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-f]{40}$/i.test(s);
const validAgent = (id: string) => /^[a-z0-9_-]{1,80}$/i.test(id) && !["__proto__", "constructor", "prototype"].includes(id);
export function parseSkin(value: unknown): BotSkin | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.collection !== "first-residents" || ![4663, 46630].includes(v.chainId as number) ||
    !address(v.contract) || !address(v.owner) || !Number.isInteger(v.tokenId) || (v.tokenId as number) < 1 || (v.tokenId as number) > 30) return null;
  return { version: 1, collection: "first-residents", chainId: v.chainId as BotSkin["chainId"],
    contract: v.contract.toLowerCase(), owner: v.owner.toLowerCase(), tokenId: v.tokenId as number };
}
function readAll() {
  if (sessionOnly) return memory;
  let raw: string | null;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return memory;
    raw = storage.getItem(SKIN_KEY);
  } catch { return memory; }
  try {
    const value = JSON.parse(raw ?? "{}");
    const result: Record<string, BotSkin> = {};
    if (value && typeof value === "object" && !Array.isArray(value)) for (const [id, raw] of Object.entries(value).slice(0, 128)) {
      const skin = parseSkin(raw); if (validAgent(id) && skin) result[id] = skin;
    }
    memory = result;
  } catch { memory = {}; }
  return memory;
}
export function loadBotSkin(agentId: string): BotSkin | null { return validAgent(agentId) ? readAll()[agentId] ?? null : null; }
export function saveBotSkin(agentId: string, skin: BotSkin | null): boolean {
  if (!validAgent(agentId)) throw new Error("Invalid bot profile");
  const clean = skin === null ? null : parseSkin(skin);
  if (skin && !clean) throw new Error("Invalid NFT skin");
  const next = { ...readAll() };
  if (clean) next[agentId] = clean; else delete next[agentId];
  memory = next;
  let persisted = false;
  try { if (globalThis.localStorage) { globalThis.localStorage.setItem(SKIN_KEY, JSON.stringify(next)); persisted = true; } } catch { /* Session-only preference. */ }
  sessionOnly = !persisted;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SKIN_EVENT));
  return persisted;
}
export function skinImage(tokenId: number): string {
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > 30) throw new Error("Invalid resident ID");
  return `${import.meta.env.BASE_URL}nft/pfp/${tokenId}.svg`;
}
