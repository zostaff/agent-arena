/**
 * DEGEN VILLAGE — the app shell.
 *
 * The browser runs the sim market and the heuristic brain: deterministic, free,
 * and safe to leave open. Live mode is `MODE=live npm run live` from node,
 * where the API key stays on the machine instead of in a bundle.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REWIRE_COST,
  Village,
  type BuildingId,
  type VillageView,
} from "../core/village.js";
import type { BoostKind } from "../core/config.js";
import type { Provider } from "../core/types.js";
import { SimMarket } from "../sim/market.js";
import { PaperMarket } from "../paper/market.js";
import type { ChainStatus } from "./Dex.jsx";
import { heuristicBrain } from "../sim/brain.js";
import { mulberry32 } from "../sim/rng.js";
import { VillageScene } from "./Village.jsx";
import {
  AgentInspector,
  BoostTimers,
  BuildingPanel,
  RivalStandings,
  SpeedControls,
  StatCards,
} from "./Hud.jsx";
import { DexOverlay } from "./Dex.jsx";
import { EMPTY_DRAFT, Forge, type ForgeDraft } from "./Forge.jsx";
import { BoardPanel } from "./Board.jsx";
import {
  loadBoard,
  loadMe,
  publishBuild,
  publishVillage,
  saveMe,
  loadVillageSave,
  saveVillage,
  clearVillageSave,
  type Board,
  type BuildEntry,
  type Me,
} from "./storage.js";
import type { BacktestComparison } from "../sim/backtest.js";

const SESSION_SEED = 42;

/** Ticks between autosaves. At 2x speed that is roughly every four seconds. */
const AUTOSAVE_EVERY_TICKS = 240;

type Overlay = "NONE" | "DEX" | "FORGE" | "BOARD";

/**
 * SIM is the seeded world that always works offline. PAPER trades the tokens
 * actually launching on Robinhood Chain right now — identity read from the
 * free public RPC, prices still simulated, nothing signed. The mode is
 * remembered per browser.
 */
export type MarketMode = "SIM" | "PAPER";
const MODE_KEY = "dv_mode";

function storedMode(): MarketMode {
  try {
    return globalThis.localStorage?.getItem(MODE_KEY) === "PAPER" ? "PAPER" : "SIM";
  } catch {
    return "SIM";
  }
}

export function App(): React.ReactElement {
  const [mode, setMode] = useState<MarketMode>(storedMode);
  const [chain, setChain] = useState<ChainStatus>({ state: "off" });

  const { village, paper } = useMemo(() => {
    if (mode === "PAPER") {
      const market = new PaperMarket({ universe: 6 });
      const v = new Village({
        market,
        brain: heuristicBrain(),
        rng: mulberry32(SESSION_SEED ^ 0x9e3779b9),
        blockingDecisions: true,
        onTick: () => market.advance(1),
      });
      return { village: v, paper: market };
    }
    const market = new SimMarket({ seed: SESSION_SEED });
    const v = new Village({
      market,
      brain: heuristicBrain(),
      rng: mulberry32(SESSION_SEED ^ 0x9e3779b9),
      blockingDecisions: true,
      onTick: () => market.advance(1),
    });
    return { village: v, paper: null };
  }, [mode]);

  /* Reading the chain is the one thing here that can fail on someone else's
     network, so it reports its own state instead of silently doing nothing. */
  useEffect(() => {
    if (!paper) {
      setChain({ state: "off" });
      return;
    }
    let alive = true;
    setChain({ state: "connecting", endpoint: paper.endpoint });
    void (async () => {
      try {
        const { chainId, head, ok } = await paper.verify();
        const tokens = await paper.refresh();
        if (!alive) return;
        setChain({
          state: ok ? "live" : "wrong-chain",
          endpoint: paper.endpoint,
          chainId,
          head,
          tokens,
          readAt: Date.now(),
        });
      } catch (err) {
        if (!alive) return;
        setChain({
          state: "error",
          endpoint: paper.endpoint,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    const timer = setInterval(() => {
      void paper
        .refresh()
        .then((tokens) => {
          if (alive) setChain((c) => ({ ...c, tokens, readAt: Date.now() }));
        })
        .catch(() => undefined);
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [paper]);

  const onMode = useCallback((next: MarketMode) => {
    try {
      globalThis.localStorage?.setItem(MODE_KEY, next);
    } catch {
      /* a browser that refuses storage still gets to switch, just not to
         remember — the mode is not worth failing over. */
    }
    setMode(next);
  }, []);

  const [view, setView] = useState<VillageView>(() => village.view());
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("NONE");
  const [selectedAgent, setSelectedAgent] = useState<string | null>("scout");
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId | null>("BARRACKS");
  const [dexPair, setDexPair] = useState<string | null>(null);
  const [draft, setDraft] = useState<ForgeDraft>(EMPTY_DRAFT);
  const [board, setBoard] = useState<Board>({ builds: [], villages: [] });
  const [boardTab, setBoardTab] = useState<"BUILDS" | "VILLAGES">("BUILDS");
  const [me, setMe] = useState<Me>({ owner: "", lastBuildId: null });
  const [toast, setToast] = useState<string | null>(null);
  /* Two-step: the second click within the window is the one that wipes. */
  const [resetArmed, setResetArmed] = useState(false);
  /* The loop must not run until we know whether there is a village to load. */
  const [booted, setBooted] = useState(false);

  /* RESET clears the save and reloads — and the reload fires pagehide, which
     would write the village straight back. This latch is what stops the wipe
     from being undone by its own reload. */
  const wipingRef = useRef(false);

  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;

  /* Restore before the first tick, so a reload resumes rather than restarts.
     A save that fails validation is ignored and the fresh village stands. */
  useEffect(() => {
    void (async () => {
      try {
        const raw = await loadVillageSave();
        if (raw && village.restore(raw)) {
          setView(village.view());
          setSelectedAgent(village.agents[0]?.id ?? null);
        }
      } finally {
        setBooted(true);
      }
    })();
  }, [village]);

  useEffect(() => {
    if (!booted) return;
    let alive = true;
    let handle = 0;
    let frame = 0;
    let lastSaveTick = village.tick;

    const loop = async (): Promise<void> => {
      if (!alive) return;
      if (!pausedRef.current) {
        for (let i = 0; i < speedRef.current; i++) await village.step();
      }
      frame += 1;
      if (frame % 2 === 0) setView(village.view());
      if (!wipingRef.current && village.tick - lastSaveTick >= AUTOSAVE_EVERY_TICKS) {
        lastSaveTick = village.tick;
        void saveVillage(village.save());
      }
      handle = requestAnimationFrame(() => void loop());
    };
    handle = requestAnimationFrame(() => void loop());
    return () => {
      alive = false;
      cancelAnimationFrame(handle);
    };
  }, [village, booted]);

  /* A tab closed between autosaves would otherwise lose up to 240 ticks. */
  useEffect(() => {
    if (!booted) return;
    const flush = (): void => {
      if (wipingRef.current) return;
      void saveVillage(village.save());
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [village, booted]);

  useEffect(() => {
    void (async () => {
      const [b, m] = await Promise.all([loadBoard(), loadMe()]);
      setBoard(b);
      setMe(m);
    })();
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const villageId = useMemo(() => `village-${me.owner || "anon"}`, [me.owner]);
  const myRank = useMemo(() => {
    const i = board.villages.findIndex((v) => v.id === villageId);
    return i >= 0 ? i + 1 : null;
  }, [board.villages, villageId]);

  const onBuyBoost = useCallback(
    (kind: BoostKind) => {
      if (village.buyBoost(kind)) setView(village.view());
      else flash("not enough coins");
    },
    [village, flash],
  );

  const onBuild = useCallback(
    (id: BuildingId) => {
      if (village.build(id)) setView(village.view());
      else flash("cannot build that right now");
    },
    [village, flash],
  );

  const onUpgrade = useCallback(
    (id: BuildingId) => {
      if (village.upgrade(id)) setView(village.view());
      else flash("cannot upgrade that right now");
    },
    [village, flash],
  );

  const onRush = useCallback(
    (id: BuildingId) => {
      if (village.rush(id)) setView(village.view());
      else flash("not enough coins to rush");
    },
    [village, flash],
  );

  const onDeploy = useCallback(
    (d: ForgeDraft) => {
      const agent = village.deployCustom({
        name: d.name || "UNNAMED",
        stats: d.stats,
        strategy: d.strategy,
        systemSuffix: d.systemSuffix,
        provider: d.provider,
      });
      if (!agent) {
        flash("deploy failed — need 150 coins and a free slot");
        return;
      }
      setSelectedAgent(agent.id);
      setOverlay("NONE");
      setView(village.view());
      flash(`${agent.name} deployed`);
    },
    [village, flash],
  );

  const onPublishBuild = useCallback(
    async (d: ForgeDraft, result: BacktestComparison) => {
      const id = `build-${me.owner}-${d.name}`;
      const entry: BuildEntry = {
        kind: "BUILD",
        id,
        name: d.name || "UNNAMED",
        owner: me.owner,
        at: Date.now(),
        pnlEth: result.build.pnlEth,
        netEth: result.build.netEth,
        spentUsd: result.build.spentUsd,
        winRate: result.build.winRate,
        maxDrawdownEth: result.build.maxDrawdownEth,
        trades: result.build.trades,
        stats: d.stats,
        strategy: d.strategy,
        systemSuffix: d.systemSuffix,
        provider: d.provider,
      };
      setBoard(await publishBuild(entry));
      const next = { ...me, lastBuildId: id };
      setMe(next);
      await saveMe(next);
      flash("build published");
    },
    [me, flash],
  );

  const onPublishVillage = useCallback(async () => {
    setBoard(
      await publishVillage({
        kind: "VILLAGE",
        id: villageId,
        name: me.owner || "anon",
        owner: me.owner,
        at: Date.now(),
        netPnlEth: village.netPnlEth,
        treasury: village.treasury,
        ticks: village.tick,
        roster: village.agents.length,
      }),
    );
    flash("village published");
  }, [village, me, villageId, flash]);

  const onLoadBuild = useCallback((e: BuildEntry) => {
    setDraft({
      name: e.name,
      stats: e.stats,
      strategy: e.strategy,
      systemSuffix: e.systemSuffix,
      provider: e.provider ?? "anthropic",
    });
    setOverlay("FORGE");
  }, []);

  /* REWIRE: the same house choice the FORGE offers, but on a live agent and
     for coins. Refused mid-position — see Village.rewire. */
  const onRewire = useCallback(
    (agentId: string, provider: Provider) => {
      if (village.rewire(agentId, provider)) {
        setView(village.view());
        flash(`rewired to ${provider}`);
      } else {
        flash(`rewire failed — needs ${REWIRE_COST} coins and no open position`);
      }
    },
    [village, flash],
  );

  /* Starting over has to be possible once progress persists — and it has to
     take two deliberate clicks, because it cannot be undone. */
  const onReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 4000);
      return;
    }
    setResetArmed(false);
    wipingRef.current = true;
    void (async () => {
      await clearVillageSave();
      window.location.reload();
    })();
  }, [resetArmed]);

  const nextCost = selectedBuilding ? village.nextCost(selectedBuilding) : null;
  const rushCost = selectedBuilding ? village.rushCost(selectedBuilding) : 0;

  return (
    <div className="dv-app">
      <header className="dv-top">
        <div className="dv-brand">
          <span className="dv-brand-mark">◆</span>
          <span className="dv-brand-name">DEGEN VILLAGE</span>
          <span className="dv-brand-sub">agent-arena · robinhood chain</span>
        </div>
        <StatCards view={view} rank={myRank} />
        <div className="dv-top-actions">
          <button className={`dv-btn${overlay === "DEX" ? " dv-btn-on" : ""}`} onClick={() => setOverlay(overlay === "DEX" ? "NONE" : "DEX")}>
            DEX
          </button>
          <button className={`dv-btn${overlay === "FORGE" ? " dv-btn-on" : ""}`} onClick={() => setOverlay(overlay === "FORGE" ? "NONE" : "FORGE")}>
            FORGE
          </button>
          <button className={`dv-btn${overlay === "BOARD" ? " dv-btn-on" : ""}`} onClick={() => setOverlay(overlay === "BOARD" ? "NONE" : "BOARD")}>
            BOARD
          </button>
          <div className="dv-mode">
            {(["SIM", "PAPER"] as const).map((m) => (
              <button
                key={m}
                className={`dv-btn dv-btn-tiny${mode === m ? " dv-mode-on" : ""}`}
                onClick={() => onMode(m)}
                title={
                  m === "SIM"
                    ? "seeded offline world"
                    : "tokens launching on Robinhood Chain right now — prices still simulated"
                }
              >
                {m}
              </button>
            ))}
          </div>
          <button className="dv-btn dv-btn-primary" onClick={() => void onPublishVillage()}>
            PUBLISH
          </button>
          <button
            className={`dv-btn dv-btn-tiny${resetArmed ? " dv-btn-danger" : ""}`}
            onClick={onReset}
            title="wipes the saved village in this browser"
          >
            {resetArmed ? "SURE?" : "RESET"}
          </button>
        </div>
      </header>

      <main className="dv-main">
        <VillageScene
          view={view}
          selectedAgent={selectedAgent}
          selectedBuilding={selectedBuilding}
          onSelectAgent={setSelectedAgent}
          onSelectBuilding={setSelectedBuilding}
        />

        <div className="dv-left">
          <AgentInspector view={view} agentId={selectedAgent} onRewire={onRewire} />
          <BuildingPanel
            view={view}
            buildingId={selectedBuilding}
            onBuild={onBuild}
            onUpgrade={onUpgrade}
            onRush={onRush}
            rushCost={rushCost}
            nextCost={nextCost}
          />
        </div>

        <div className="dv-right">
          <BoostTimers view={view} onBuy={onBuyBoost} />
        </div>

        <div className="dv-bottom-right">
          <RivalStandings entries={board.villages} meId={villageId} />
          <SpeedControls
            speed={speed}
            paused={paused}
            onSpeed={(s) => {
              setSpeed(s);
              setPaused(false);
            }}
            onPause={() => setPaused((p) => !p)}
          />
        </div>

        {overlay === "DEX" && (
          <DexOverlay
            view={view}
            pair={dexPair}
            onPair={setDexPair}
            chain={chain}
            onClose={() => setOverlay("NONE")}
          />
        )}
        {overlay === "FORGE" && (
          <Forge
            draft={draft}
            onDraft={setDraft}
            treasury={view.treasury}
            customCount={view.agents.filter((a) => a.custom).length}
            onDeploy={onDeploy}
            onPublish={(d, r) => void onPublishBuild(d, r)}
            onClose={() => setOverlay("NONE")}
          />
        )}
        {overlay === "BOARD" && (
          <BoardPanel
            board={board}
            meOwner={me.owner}
            tab={boardTab}
            onTab={setBoardTab}
            onLoadBuild={onLoadBuild}
            onClose={() => setOverlay("NONE")}
          />
        )}

        {toast && <div className="dv-toast">{toast}</div>}
      </main>
    </div>
  );
}
