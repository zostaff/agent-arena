import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { equipResident, ownedResidents, supportedSkin } from "../src/nft/skins.js";
import { loadBotSkin, parseSkin, saveBotSkin, SKIN_KEY, skinImage, type BotSkin } from "../src/nft/skinStore.js";
import type { BrowserWallet, NftClient } from "../src/nft/mint.js";
import type { Deployment } from "../src/nft/config.js";
import { BotAvatar } from "../src/ui/nft/BotAvatar.js";
import SkinPicker from "../src/ui/nft/SkinPicker.js";
import { runtime } from "./fixtures/residents-runtime.json";

const account = "0x0000000000000000000000000000000000000001", other = "0x0000000000000000000000000000000000000002";
const config: Deployment = { chainId: 4663, address: "0x0000000000000000000000000000000000000030" };
const skin: BotSkin = { version: 1, collection: "first-residents", chainId: 4663, contract: config.address, tokenId: 1, owner: account };
function mocks() {
  const request = vi.fn(async () => [account]);
  const client = { getChainId: vi.fn(async () => 4663), getCode: vi.fn(async () => runtime),
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: unknown[] }): Promise<unknown> => {
      if (functionName === "MAX_SUPPLY") return 30n;
      if (functionName === "totalSupply") return 3n;
      if (functionName === "hasMinted") return true;
      return args?.[0] === 2n ? other : account;
    }) };
  return { client: client as unknown as NftClient, calls: client, wallet: { request } as BrowserWallet, request };
}
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  return data;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("cosmetic NFT bot profiles", () => {
  it("validates identifiers and drops imported image URLs and claimed bonuses", () => {
    expect(parseSkin({ ...skin, image: "javascript:alert(1)", spd: 100 })).toEqual(skin);
    for (const bad of [null, [], {}, { ...skin, tokenId: 0 }, { ...skin, tokenId: 31 }, { ...skin, tokenId: 1.5 },
      { ...skin, owner: "not-an-address" }, { ...skin, chainId: 1 }, { ...skin, collection: "unreviewed" }]) expect(parseSkin(bad)).toBeNull();
    expect(skinImage(1)).toMatch(/nft\/pfp\/1.svg$/);
    expect(() => skinImage(NaN)).toThrow();
  });
  it("persists a profile selection and resets it without altering unrelated village saves", () => {
    const data = storage(); data.set("dv_save_sim", "village-save");
    expect(saveBotSkin("scout", skin)).toBe(true);
    expect(loadBotSkin("scout")).toEqual(skin);
    expect(loadBotSkin("sniper")).toBeNull();
    expect(saveBotSkin("scout", null)).toBe(true);
    expect(loadBotSkin("scout")).toBeNull();
    expect(data.get("dv_save_sim")).toBe("village-save");
  });
  it("rejects malformed saved profiles and prototype keys", () => {
    const data = storage();
    data.set(SKIN_KEY, "{malformed"); expect(loadBotSkin("scout")).toBeNull();
    data.set(SKIN_KEY, JSON.stringify({ scout: { ...skin, tokenId: "1" } })); expect(loadBotSkin("scout")).toBeNull();
    expect(() => saveBotSkin("__proto__", skin)).toThrow("Invalid bot");
    expect(() => saveBotSkin("scout", { ...skin, tokenId: 999 })).toThrow("Invalid NFT");
  });
  it("scopes skins to a reviewed collection and chain", () => {
    expect(supportedSkin(skin, config)).toBe(true);
    expect(supportedSkin(skin, null)).toBe(false);
    expect(supportedSkin({ ...skin, chainId: 46630 }, config)).toBe(false);
    expect(supportedSkin({ ...skin, contract: other }, config)).toBe(false);
  });
  it("lists only currently owned minted tokens with read-only calls", async () => {
    const { client, calls, request } = mocks();
    expect(await ownedResidents(client, config, account)).toEqual([1, 3]);
    expect(calls.readContract.mock.calls.filter(([arg]) => arg.functionName === "ownerOf")).toHaveLength(3);
    expect(request).not.toHaveBeenCalled();
  });
  it("revalidates ownership when equipping and requests no signature or transaction", async () => {
    const { client, wallet, request } = mocks();
    expect(await equipResident(client, config, wallet, account, 1)).toEqual(skin);
    expect(request.mock.calls).toEqual([[{ method: "eth_accounts" }], [{ method: "eth_accounts" }]]);
    await expect(equipResident(client, config, wallet, account, 2)).rejects.toThrow("no longer owns");
    await expect(equipResident(client, config, wallet, account, 4)).rejects.toThrow("has not been minted");
  });
  it("does not equip after an account change or failed RPC", async () => {
    const { client, wallet, request, calls } = mocks();
    request.mockResolvedValueOnce([other]);
    await expect(equipResident(client, config, wallet, account, 1)).rejects.toThrow("account changed");
    calls.getCode.mockRejectedValueOnce(new Error("offline"));
    await expect(equipResident(client, config, wallet, account, 1)).rejects.toThrow("offline");
    request.mockResolvedValueOnce([account]).mockResolvedValueOnce([other]);
    await expect(equipResident(client, config, wallet, account, 1)).rejects.toThrow("account changed");
  });
  it("renders a neutral avatar and a read-only prelaunch wardrobe", () => {
    storage();
    const avatar = renderToStaticMarkup(<BotAvatar agentId="scout" name="SCOUT" editable />);
    expect(avatar).toContain("CHANGE PFP"); expect(avatar).toContain("Default bot avatar");
    const picker = renderToStaticMarkup(<SkinPicker agentId="scout" name="SCOUT" deployment={null} onClose={() => {}} />);
    expect(picker).toContain("FIRST RESIDENTS / PREVIEW");
    expect(picker).not.toContain("CONNECT WALLET FOR SKINS");
    expect(picker.match(/aria-label="Equip /g)).toHaveLength(30);
  });
  it("retains a session choice when storage writes fail, then can persist again", () => {
    const data = storage();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); } });
    expect(saveBotSkin("scout", skin)).toBe(false);
    expect(loadBotSkin("scout")).toEqual(skin);
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    expect(saveBotSkin("scout", null)).toBe(true);
    expect(loadBotSkin("scout")).toBeNull();
  });
});
