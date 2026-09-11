/**
 * DEGEN VILLAGE — the app shell.
 *
 * The browser runs SIM, CHAIN or real-quote PAPER with a free heuristic brain. Live mode is `MODE=live npm run live` from node,
 * where the API key stays on the machine instead of in a bundle.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REWIRE_COST,
  type BuildingId,
  type VillageView,
} from "../core/village.js";
import type { BoostKind } from "../core/config.js";
import type { Provider } from "../core/types.js";
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
import { Forge } from "./Forge.jsx";
import { EMPTY_DRAFT, parseBuild, type ForgeDraft } from "../core/build.js";
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
import { useMarketSession, storedMode, MODE_KEY, type MarketMode } from "./useMarketSession.js";
import { FlyScene } from "./fly/FlyScene.js";
import { AgentTerminal } from "./fly/Terminal.js";
import { joinFlySwarm } from "../fly/roster.js";
import { attachFlyShortcut } from "../fly/shortcut.js";
import type { BacktestComparison } from "../sim/backtest.js";


/** Ticks between autosaves. At 2x speed that is roughly every four seconds. */
const AUTOSAVE_EVERY_TICKS = 240;

type Overlay = "NONE" | "DEX" | "FORGE" | "BOARD" | "TERMINAL";

export function App(): React.ReactElement {
  const [mode] = useState<MarketMode>(storedMode);
  const { village, chain, feed } = useMarketSession(mode);

  const onMode = useCallback((next: MarketMode) => {
    try {
      globalThis.localStorage?.setItem(MODE_KEY, next);
    } catch {
      /* a browser that refuses storage still gets to switch, just not to
         remember — the mode is not worth failing over. */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.location.assign(url.href);
  }, []);

  const [view, setView] = useState<VillageView>(() => village.view());
  const [flyOpen, setFlyOpen] = useState(false);
  const flyBuffer = useRef("");
  useEffect(() => attachFlyShortcut(window, flyBuffer, () => setFlyOpen(true)), []);
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
  speedRef.current = mode === "PAPER" ? 1 : speed;
  pausedRef.current = paused;

  /* Restore before the first tick, so a reload resumes rather than restarts.
     A save that fails validation is ignored and the fresh village stands. */
  useEffect(() => {
    if (mode === "PAPER") { setBooted(true); return; }
    void (async () => {
      try {
        const raw = await loadVillageSave(mode);
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
      if (!alive) return;
      frame += 1;
      if (frame % 2 === 0) setView(village.view());
      if (mode !== "PAPER" && !wipingRef.current && village.tick - lastSaveTick >= AUTOSAVE_EVERY_TICKS) {
        lastSaveTick = village.tick;
        void saveVillage(village.save(), mode);
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
      if (wipingRef.current || mode === "PAPER") return;
      void saveVillage(village.save(), mode);
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

  const onJoinSwarm = useCallback(() => {
    const [fly] = joinFlySwarm(village);
    setSelectedAgent(fly.id);
    setOverlay("NONE");
    setView(village.view());
  }, [village]);

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
    const parsed = parseBuild(e);
    if (!parsed.ok) {
      flash(parsed.error);
      return;
    }
    setDraft(parsed.draft);
    setOverlay("FORGE");
  }, [flash]);

  /* REWIRE: the same house choice the FORGE offers, but on a live agent and
     for coins. Refused mid-position — see Village.rewire. */
  const onRewire = useCallback(
    (agentId: string, provider: Provider) => {
      if (village.rewire(agentId, provider)) {
        setView(village.view());
        flash(`rewired to ${provider}`);
      } else {
        flash(`rewire failed — needs ${REWIRE_COST} coins, no position or pending decision`);
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
      if (mode !== "PAPER") await clearVillageSave(mode);
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
          <span className="dv-brand-sub">AI agents · paper trading</span>
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
            {(["SIM", "CHAIN", "PAPER"] as const).map((m) => (
              <button
                key={m}
                className={`dv-btn dv-btn-tiny${mode === m ? " dv-mode-on" : ""}`}
                onClick={() => onMode(m)}
                title={
                  m === "SIM"
                    ? "seeded offline world"
                    : m === "PAPER" ? "real Coinbase quotes, 10 virtual ETH, heuristic bots"
                    : "real chain identities, simulated prices"
                }
              >
                {m}
              </button>
            ))}
          </div>
          <button className="dv-btn dv-btn-primary" disabled={mode === "PAPER"} title={mode === "PAPER" ? "Paper rankings need server verification" : "Save village score"} onClick={() => void onPublishVillage()}>
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
      <div className="dv-save-note" role="status">
        {mode === "PAPER" ? <>
          PAPER · {feed.state}: {feed.message} · cash {(view.paperCashEth ?? 10).toFixed(4)} / initial 10 virtual ETH
          · fee assumption 0.60% per side · heuristic bots · model costs are estimates, no API billing
          · session resets on reload · quotes use real time
        </> : <>Progress saved in this browser · no cloud sync · {mode === "CHAIN" ? "real token identities, simulated prices" : "offline simulation"}</>}
      </div>

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
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="dv-btn hb" onClick={() => setOverlay("TERMINAL")}>▣ TERMINAL</button>
            <button className="dv-btn hb" style={{ color: "#CCFF00", borderColor: "#CCFF0055" }} onClick={() => setFlyOpen(true)}>🪰 FLY SWARM</button>
          </div>
          <SpeedControls
            speed={mode === "PAPER" ? 1 : speed}
            paused={paused}
            fixedSpeed={mode === "PAPER"}
            onSpeed={(s) => {
              if (mode !== "PAPER") setSpeed(s);
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
            customCount={view.agents.filter((a) => a.custom && a.cls !== "FLY").length}
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

        {overlay === "TERMINAL" && <AgentTerminal ui={view} onClose={() => setOverlay("NONE")} />}
        {flyOpen && <FlyScene ui={view} mode={mode} onClose={() => setFlyOpen(false)} onJoin={onJoinSwarm} />}
        {toast && <div className="dv-toast">{toast}</div>}
      </main>
    </div>
  );
}

export default App;
