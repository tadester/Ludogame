"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyAction,
  chargeOf,
  equippedUltimate,
  getLegalActions,
  isUltimateReady,
  ultimateCost,
  ultimateUsesLeft,
} from "@/lib/ludo";
import type {
  DomainEvent,
  MatchState,
  PowerKind,
  Ruleset,
  UltimateKind,
} from "@/lib/ludo";
import { moveWaypoints } from "@/lib/ludo-ui/geometry";
import type { Cell, PlayerColor } from "@/lib/ludo-ui/geometry";
import {
  actionDestination,
  defaultName,
  diceCountFor,
  dieOrderOptions,
  legalMovesByToken,
  rollActionFor,
  rollDie,
  setupLocalMatch,
} from "@/lib/ludo-ui/local-game";
import {
  clearMatch,
  loadMatch,
  loadPreferences,
  saveMatch,
  savePreferences,
} from "@/lib/ludo-ui/local-storage";
import {
  POWER_FEEDBACK,
  POWER_LABEL,
  POWER_ORDER,
  ULTIMATE_DESC,
  ULTIMATE_LABEL,
} from "@/lib/ludo-ui/powers-meta";

import { Dice } from "./dice";
import { LudoBoard } from "./ludo-board";
import { StrategyBook } from "./strategy-book";
import styles from "./local-match.module.css";

const SETUP_COLORS: PlayerColor[] = ["red", "green", "yellow", "blue"];
const RULESETS: { id: Ruleset; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "nigerian", label: "Nigerian" },
  { id: "peaceful", label: "Peaceful" },
  { id: "blitz", label: "Blitz" },
  { id: "extreme", label: "Extreme" },
];
const STEP_MS = 165;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tokenLabel = (token: { color: PlayerColor; id: string }) =>
  `${token.color} #${token.id.split("-").at(-1)}`;

type Effect = { id: number; icon: string; label: string; tone: string };

const POWER_EFFECT: Record<PowerKind, { icon: string; label: string }> = {
  shield: { icon: "🛡️", label: "Shield" },
  dash: { icon: "💨", label: "Dash" },
  warp: { icon: "🌀", label: "Warp" },
  snipe: { icon: "🎯", label: "Snipe" },
  swap: { icon: "🔄", label: "Swap" },
  summon: { icon: "✨", label: "Summon" },
  bolt: { icon: "⚡", label: "Bolt" },
};

const ULTIMATE_EFFECT: Record<UltimateKind, { icon: string; label: string }> = {
  meteor: { icon: "☄️", label: "Meteor!" },
  quake: { icon: "🌋", label: "Quake!" },
  surge: { icon: "🛡️", label: "Surge!" },
};

/** The most salient visual effect for a batch of events, if any. Ultimates beat
 *  powers beat map events. */
function effectFor(events: readonly DomainEvent[]): Omit<Effect, "id"> | null {
  const ult = events.find((e) => e.type === "ultimate-used") as
    | { ultimate: UltimateKind }
    | undefined;
  if (ult) {
    const meta = ULTIMATE_EFFECT[ult.ultimate];
    return { icon: meta.icon, label: meta.label, tone: `ult_${ult.ultimate}` };
  }
  const power = events.find((e) => e.type === "power-used") as
    | { power: PowerKind }
    | undefined;
  if (power) {
    const meta = POWER_EFFECT[power.power];
    return { icon: meta.icon, label: meta.label, tone: `power_${power.power}` };
  }
  const map = events.find((e) => e.type === "map-event") as
    | { event: "earthquake" | "power-surge" }
    | undefined;
  if (map) {
    return map.event === "earthquake"
      ? { icon: "🌋", label: "Earthquake!", tone: "quake" }
      : { icon: "⚡", label: "Power surge!", tone: "surge" };
  }
  return null;
}

const SHAKE_TONES = new Set(["ult_quake", "quake"]);

const COLOR_CLASS: Record<PlayerColor, string> = {
  red: styles.colorRed,
  green: styles.colorGreen,
  yellow: styles.colorYellow,
  blue: styles.colorBlue,
};

type Seat = MatchState["players"][number];

export function LocalMatch() {
  const [count, setCount] = useState(2);
  const [ruleset, setRuleset] = useState<Ruleset>("classic");
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dieFaces, setDieFaces] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [override, setOverride] = useState<{
    tokenId: string;
    cell: Cell;
  } | null>(null);
  const [captured, setCaptured] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState("");
  const [winner, setWinner] = useState<string | null>(null);
  const [handoffTo, setHandoffTo] = useState<Seat | null>(null);
  const [savedMatch, setSavedMatch] = useState<MatchState | null>(null);
  // A two-step power (swap) tracks which of your tokens is the source while you
  // pick the opponent token to act on.
  const [powerTarget, setPowerTarget] = useState<{
    power: PowerKind;
    sourceId: string;
  } | null>(null);
  // While true, the player is choosing an enemy token for a Meteor ultimate.
  const [meteorTargeting, setMeteorTargeting] = useState(false);
  // A transient visual flourish for powers, ultimates, and map events.
  const [effect, setEffect] = useState<Effect | null>(null);

  const movesByToken = useMemo(() => {
    if (!match || match.phase !== "awaiting-move" || busy) {
      return new Map();
    }
    return legalMovesByToken(match, getLegalActions(match));
  }, [match, busy]);

  const movableTokenIds = useMemo<ReadonlySet<string>>(
    () => new Set(movesByToken.keys()),
    [movesByToken],
  );

  const dieOrders = useMemo(() => {
    if (!match || match.phase !== "awaiting-die-order" || busy) {
      return [];
    }
    return dieOrderOptions(getLegalActions(match));
  }, [match, busy]);

  const activePlayer = match ? match.players[match.activePlayerIndex] : null;

  const start = useCallback(() => {
    // The strategy book and ultimate are managed by the StrategyBook editor and
    // saved in preferences, so read them fresh here.
    const prefs = loadPreferences();
    const loadout = prefs?.loadout ?? [];
    const ultimate = prefs?.ultimate;
    savePreferences({ count, ruleset, names, loadout, ultimate });
    const next = setupLocalMatch(
      Array.from({ length: count }, (_, i) => ({ name: names[i] ?? "" })),
      ruleset,
      ruleset === "extreme" ? loadout : [],
      ruleset === "extreme" ? ultimate : undefined,
    );
    setMatch(next);
    setWinner(null);
    setDieFaces([]);
    setOverride(null);
    setCaptured(new Set());
    setHandoffTo(null);
    setMessage(`${next.players[next.activePlayerIndex].displayName} to roll.`);
  }, [count, ruleset, names]);

  const newGame = useCallback(() => {
    clearMatch();
    setSavedMatch(null);
    setHandoffTo(null);
    setMatch(null);
  }, []);

  // Flashes captured tokens and returns the status line for a transition.
  const resolve = useCallback(
    (next: MatchState, events: readonly DomainEvent[], prefix = "") => {
      const capturedIds = events
        .filter((e) => e.type === "token-captured")
        .map((e) => (e as { capturedTokenId: string }).capturedTokenId);
      if (capturedIds.length > 0) {
        setCaptured(new Set(capturedIds));
        setTimeout(() => setCaptured(new Set()), 500);
      }

      const eff = effectFor(events);
      if (eff) {
        const shown = { ...eff, id: Date.now() };
        setEffect(shown);
        setTimeout(
          () => setEffect((cur) => (cur?.id === shown.id ? null : cur)),
          1000,
        );
      }

      const completed = events.find((e) => e.type === "match-completed");
      if (completed) {
        const championId = (completed as { winnerPlayerId: string })
          .winnerPlayerId;
        const champion = next.players.find((p) => p.id === championId);
        setWinner(champion?.displayName ?? "Winner");
        setMessage(`${champion?.displayName ?? "A player"} wins the game!`);
        return;
      }

      // A turn change hands the device to the next player — gate behind a
      // private handoff screen so play passes cleanly.
      if (
        next.status === "active" &&
        events.some((e) => e.type === "turn-advanced")
      ) {
        setHandoffTo(next.players[next.activePlayerIndex]);
      }

      const mapEvent = events.find((e) => e.type === "map-event") as
        | { event: "earthquake" | "power-surge" }
        | undefined;
      const mapPrefix = mapEvent
        ? mapEvent.event === "earthquake"
          ? "🌋 Earthquake! Exposed tokens slid back. "
          : "⚡ Power surge! Everyone banks a power. "
        : "";

      const name = next.players[next.activePlayerIndex].displayName;
      let status: string;
      if (next.phase === "awaiting-die-order") {
        status = `${name}: choose the dice order.`;
      } else if (next.phase === "awaiting-move") {
        status = `${name}: pick a token to move.`;
      } else if (capturedIds.length > 0) {
        status = `Capture! ${name} rolls again.`;
      } else if (events.some((e) => e.type === "bonus-roll-granted")) {
        status = `Bonus roll — ${name} goes again.`;
      } else {
        status = `${name}'s turn — roll the dice.`;
      }
      setMessage(prefix + mapPrefix + status);
    },
    [],
  );

  const resume = useCallback(() => {
    const saved = loadMatch();
    if (!saved) return;
    setMatch(saved);
    setOverride(null);
    setCaptured(new Set());
    setHandoffTo(null);
    setDieFaces(
      saved.pendingRoll ? saved.pendingRoll.dice.map((d) => d.value) : [],
    );
    if (saved.status === "completed" && saved.winnerPlayerId) {
      const champ = saved.players.find((p) => p.id === saved.winnerPlayerId);
      setWinner(champ?.displayName ?? "Winner");
      setMessage(`${champ?.displayName ?? "A player"} wins the game!`);
    } else {
      setWinner(null);
      resolve(saved, []);
    }
  }, [resolve]);

  const handleRoll = useCallback(async () => {
    if (!match || busy || match.phase !== "awaiting-roll") return;

    const diceCount = diceCountFor(match.ruleset);
    setBusy(true);
    setRolling(true);
    const values = Array.from({ length: diceCount }, () => rollDie());
    for (let i = 0; i < 9; i += 1) {
      setDieFaces([]);
      await sleep(55);
    }
    setDieFaces(values);
    setRolling(false);

    const result = applyAction(match, rollActionFor(match, values));
    setMatch(result.state);
    resolve(result.state, result.events, `Rolled ${values.join(" + ")}. `);
    setBusy(false);
  }, [match, busy, resolve]);

  const handleSelectOrder = useCallback(
    (dieIds: readonly string[]) => {
      if (!match || busy || match.phase !== "awaiting-die-order") return;
      const result = applyAction(match, {
        type: "select-die-order",
        expectedVersion: match.version,
        playerId: match.players[match.activePlayerIndex].id,
        dieIds: [...dieIds],
      });
      setMatch(result.state);
      resolve(result.state, result.events);
    },
    [match, busy, resolve],
  );

  const handleToken = useCallback(
    async (tokenId: string) => {
      if (!match || busy || match.phase !== "awaiting-move") return;
      const action = legalMovesByToken(match, getLegalActions(match)).get(
        tokenId,
      );
      if (!action) return;
      const dest = actionDestination(match, action);
      if (!dest) return;

      setBusy(true);
      const token = match.tokens.find((t) => t.id === tokenId)!;
      for (const cell of moveWaypoints(token.color, dest.from, dest.to)) {
        setOverride({ tokenId, cell });
        await sleep(STEP_MS);
      }

      const result = applyAction(match, action);
      setOverride(null);
      setMatch(result.state);
      resolve(result.state, result.events);
      setBusy(false);
    },
    [match, busy, resolve],
  );

  const handleUsePower = useCallback(
    (power: PowerKind, tokenId: string, targetTokenId?: string) => {
      if (!match || busy || match.phase !== "awaiting-roll") return;
      const result = applyAction(match, {
        type: "use-power",
        expectedVersion: match.version,
        playerId: match.players[match.activePlayerIndex].id,
        power,
        tokenId,
        ...(targetTokenId ? { targetTokenId } : {}),
      });
      setPowerTarget(null);
      setMatch(result.state);
      resolve(result.state, result.events, POWER_FEEDBACK[power]);
    },
    [match, busy, resolve],
  );

  const handleUseUltimate = useCallback(
    (ultimate: UltimateKind, targetTokenId?: string) => {
      if (!match || busy || match.phase !== "awaiting-roll") return;
      const result = applyAction(match, {
        type: "use-ultimate",
        expectedVersion: match.version,
        playerId: match.players[match.activePlayerIndex].id,
        ultimate,
        ...(targetTokenId ? { targetTokenId } : {}),
      });
      setPowerTarget(null);
      setMatch(result.state);
      resolve(
        result.state,
        result.events,
        `${ULTIMATE_LABEL[ultimate]} unleashed! `,
      );
    },
    [match, busy, resolve],
  );

  // Hydrate saved preferences and any in-progress match once on mount. This
  // must run in an effect (not a lazy initializer) so server and client render
  // the same defaults and avoid a hydration mismatch.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const prefs = loadPreferences();
    if (prefs) {
      setCount(prefs.count);
      setRuleset(prefs.ruleset);
      setNames([0, 1, 2, 3].map((i) => prefs.names[i] ?? ""));
    }
    setSavedMatch(loadMatch());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist the in-progress match so a refresh can resume it.
  useEffect(() => {
    if (match) saveMatch(match);
  }, [match]);

  const dieValue = (dieId: string) =>
    match?.pendingRoll?.dice.find((d) => d.id === dieId)?.value ?? 0;

  if (!match) {
    return (
      <div className={styles.setup}>
        <h1>Pass &amp; play</h1>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Mode</span>
          <div className={styles.segment}>
            {RULESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.segmentButton} ${ruleset === option.id ? styles.segmentActive : ""}`}
                onClick={() => setRuleset(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {ruleset === "extreme" ? (
          <details className={styles.bookDetails}>
            <summary className={styles.bookSummary}>
              Strategy book &amp; ultimate
            </summary>
            <StrategyBook />
          </details>
        ) : null}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Players</span>
          <div className={styles.segment}>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.segmentButton} ${count === n ? styles.segmentActive : ""}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Names</span>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={styles.nameRow}>
              <span
                className={`${styles.playerDot} ${COLOR_CLASS[SETUP_COLORS[i]]}`}
              />
              <input
                value={names[i]}
                placeholder={defaultName(SETUP_COLORS[i])}
                maxLength={16}
                onChange={(event) =>
                  setNames((prev) => {
                    const next = [...prev];
                    next[i] = event.target.value;
                    return next;
                  })
                }
              />
            </div>
          ))}
        </div>
        <button type="button" className={styles.startButton} onClick={start}>
          Start game
        </button>
        {savedMatch ? (
          <button type="button" className={styles.newGame} onClick={resume}>
            Resume saved game
          </button>
        ) : null}
      </div>
    );
  }

  const diceCount = diceCountFor(match.ruleset);
  const canRoll =
    !busy && match.phase === "awaiting-roll" && !winner && !handoffTo;
  const homeCounts = (playerId: string) =>
    match.tokens.filter((t) => t.playerId === playerId && t.status === "won")
      .length;

  return (
    <>
      {effect ? (
        <div
          key={effect.id}
          className={`${styles.effect} ${styles[`tone_${effect.tone}`] ?? ""}`}
          role="status"
          aria-label={effect.label}
        >
          <span className={styles.effectIcon}>{effect.icon}</span>
          <span className={styles.effectLabel}>{effect.label}</span>
        </div>
      ) : null}
      <div
        className={`${styles.layout} ${effect && SHAKE_TONES.has(effect.tone) ? styles.shake : ""}`}
      >
        <LudoBoard
          match={match}
          movableTokenIds={movableTokenIds}
          animatingTokenId={override?.tokenId ?? null}
          animatingCell={override?.cell ?? null}
          capturedTokenIds={captured}
          interactive={!busy}
          onTokenClick={handleToken}
          powerTileRingIndexes={
            match.powerUps
              ? new Set(match.powerUps.tiles.map((t) => t.ringIndex))
              : undefined
          }
        />

        <aside className={styles.panel}>
          {activePlayer ? (
            <div className={styles.turn}>
              <span
                className={`${styles.dot} ${COLOR_CLASS[activePlayer.color]}`}
              />
              {activePlayer.displayName}
            </div>
          ) : null}

          <div className={styles.controls}>
            <div className={styles.diceRow}>
              {Array.from({ length: diceCount }, (_, i) => (
                <Dice
                  key={i}
                  value={dieFaces[i] ?? null}
                  rolling={rolling}
                  ready={canRoll}
                  disabled={!canRoll}
                  onRoll={handleRoll}
                />
              ))}
            </div>
            <p className={styles.message}>{message}</p>
          </div>

          {dieOrders.length > 0 ? (
            <div className={styles.dieOrders}>
              {dieOrders.map((option) => (
                <button
                  key={option.dieIds.join("-")}
                  type="button"
                  className={styles.segmentButton}
                  onClick={() => handleSelectOrder(option.dieIds)}
                >
                  Play {option.dieIds.map((id) => dieValue(id)).join(" then ")}
                </button>
              ))}
            </div>
          ) : null}

          {match.ruleset === "extreme" && activePlayer
            ? (() => {
                const power = match.powerUps;
                const held = power?.inventory[activePlayer.id] ?? [];
                const canUse = !busy && match.phase === "awaiting-roll";
                const myActive = match.tokens.filter(
                  (t) =>
                    t.playerId === activePlayer.id && t.status === "active",
                );
                const enemyActive = match.tokens.filter(
                  (t) =>
                    t.playerId !== activePlayer.id && t.status === "active",
                );
                const myYard = match.tokens.filter(
                  (t) => t.playerId === activePlayer.id && t.status === "yard",
                );
                const myUltimate = equippedUltimate(match, activePlayer.id);
                const charge = chargeOf(match, activePlayer.id);
                const cost = ultimateCost(match, activePlayer.id);
                const usesLeft = ultimateUsesLeft(match, activePlayer.id);
                const ultimateReady = isUltimateReady(match, activePlayer.id);
                const usesLabel = Number.isFinite(usesLeft)
                  ? `${usesLeft} use${usesLeft === 1 ? "" : "s"} left`
                  : "reusable";
                const myWon = match.tokens.filter(
                  (t) => t.playerId === activePlayer.id && t.status === "won",
                ).length;
                const opponentBigLead = match.players.some(
                  (p) =>
                    p.id !== activePlayer.id &&
                    match.tokens.filter(
                      (t) => t.playerId === p.id && t.status === "won",
                    ).length >= 2,
                );
                const lastStand =
                  myActive.length === 1 && myWon === 0 && opponentBigLead;
                const counts = POWER_ORDER.map((kind) => ({
                  kind,
                  count: held.filter((p) => p === kind).length,
                })).filter((entry) => entry.count > 0);
                return (
                  <div className={styles.dieOrders}>
                    <p className={styles.message}>
                      {counts.length === 0
                        ? "No powers yet — land on ✦ tiles."
                        : counts
                            .map((c) => `${POWER_LABEL[c.kind]}: ${c.count}`)
                            .join(" · ")}
                    </p>
                    {lastStand ? (
                      <p className={styles.message}>
                        ⚔️ Last stand — your lone piece moves double!
                      </p>
                    ) : null}
                    {canUse && powerTarget?.power === "swap"
                      ? (() => {
                          const source = match.tokens.find(
                            (t) => t.id === powerTarget.sourceId,
                          );
                          return (
                            <>
                              <p className={styles.message}>
                                Swap{" "}
                                {source ? tokenLabel(source) : "your token"} with…
                              </p>
                              {enemyActive.map((t) => (
                                <button
                                  key={`swap-target-${t.id}`}
                                  type="button"
                                  className={styles.segmentButton}
                                  onClick={() =>
                                    handleUsePower(
                                      "swap",
                                      powerTarget.sourceId,
                                      t.id,
                                    )
                                  }
                                >
                                  {tokenLabel(t)}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={styles.segmentButton}
                                onClick={() => setPowerTarget(null)}
                              >
                                Cancel
                              </button>
                            </>
                          );
                        })()
                      : null}
                    {canUse && !powerTarget
                      ? counts.flatMap(({ kind }) => {
                          if (kind === "shield" || kind === "dash") {
                            const armed =
                              kind === "shield"
                                ? power?.shieldedTokenIds
                                : power?.dashTokenIds;
                            return myActive
                              .filter((t) => !armed?.includes(t.id))
                              .map((t) => (
                                <button
                                  key={`${kind}-${t.id}`}
                                  type="button"
                                  className={styles.segmentButton}
                                  onClick={() => handleUsePower(kind, t.id)}
                                >
                                  {POWER_LABEL[kind]} {tokenLabel(t)}
                                </button>
                              ));
                          }
                          if (kind === "warp") {
                            return myActive.map((t) => (
                              <button
                                key={`warp-${t.id}`}
                                type="button"
                                className={styles.segmentButton}
                                onClick={() => handleUsePower("warp", t.id)}
                              >
                                Warp {tokenLabel(t)}
                              </button>
                            ));
                          }
                          if (kind === "snipe" || kind === "bolt") {
                            return enemyActive.map((t) => (
                              <button
                                key={`${kind}-${t.id}`}
                                type="button"
                                className={styles.segmentButton}
                                onClick={() => handleUsePower(kind, t.id, t.id)}
                              >
                                {POWER_LABEL[kind]} {tokenLabel(t)}
                              </button>
                            ));
                          }
                          if (kind === "summon") {
                            return myYard.map((t) => (
                              <button
                                key={`summon-${t.id}`}
                                type="button"
                                className={styles.segmentButton}
                                onClick={() => handleUsePower("summon", t.id)}
                              >
                                Summon {tokenLabel(t)}
                              </button>
                            ));
                          }
                          // swap: first pick which of your tokens to move.
                          return myActive.map((t) => (
                            <button
                              key={`swap-${t.id}`}
                              type="button"
                              className={styles.segmentButton}
                              onClick={() =>
                                setPowerTarget({ power: "swap", sourceId: t.id })
                              }
                            >
                              Swap {tokenLabel(t)}…
                            </button>
                          ));
                        })
                      : null}

                    {usesLeft > 0 ? (
                      <>
                        <div className={styles.ultimateMeter} aria-hidden="true">
                          <div
                            className={styles.ultimateFill}
                            style={{
                              width: `${Math.min(100, (charge / cost) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className={styles.message}>
                          {ULTIMATE_LABEL[myUltimate]} ultimate ·{" "}
                          {ultimateReady
                            ? "🔥 ready!"
                            : `${Math.round((charge / cost) * 100)}% charged`}{" "}
                          · {usesLabel}
                        </p>
                      </>
                    ) : (
                      <p className={styles.message}>
                        {ULTIMATE_LABEL[myUltimate]} ultimate spent.
                      </p>
                    )}

                    {canUse && ultimateReady && !powerTarget && meteorTargeting
                      ? (() => (
                          <>
                            <p className={styles.message}>Meteor — strike…</p>
                            {enemyActive.map((t) => (
                              <button
                                key={`meteor-${t.id}`}
                                type="button"
                                className={styles.ultimateButton}
                                onClick={() => handleUseUltimate("meteor", t.id)}
                              >
                                {tokenLabel(t)}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={styles.segmentButton}
                              onClick={() => setMeteorTargeting(false)}
                            >
                              Cancel
                            </button>
                          </>
                        ))()
                      : null}

                    {canUse && ultimateReady && !powerTarget && !meteorTargeting
                      ? (
                          <button
                            type="button"
                            className={styles.ultimateButton}
                            title={ULTIMATE_DESC[myUltimate]}
                            onClick={() =>
                              myUltimate === "meteor"
                                ? setMeteorTargeting(true)
                                : handleUseUltimate(myUltimate)
                            }
                          >
                            Unleash {ULTIMATE_LABEL[myUltimate]}
                          </button>
                        )
                      : null}
                  </div>
                );
              })()
            : null}

          <div className={styles.players}>
            {match.players.map((player) => (
              <div
                key={player.id}
                className={`${styles.playerRow} ${player.id === activePlayer?.id ? styles.playerActive : ""}`}
              >
                <span
                  className={`${styles.playerDot} ${COLOR_CLASS[player.color]}`}
                />
                <span className={styles.playerName}>{player.displayName}</span>
                <span className={styles.home}>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`${styles.homePip} ${i < homeCounts(player.id) ? styles.homePipFilled : ""}`}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>

          <button type="button" className={styles.newGame} onClick={newGame}>
            New game
          </button>
        </aside>
      </div>

      {handoffTo && !winner ? (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <span
              className={`${styles.dot} ${COLOR_CLASS[handoffTo.color]}`}
              style={{ margin: "0 auto" }}
            />
            <h2>Pass to {handoffTo.displayName}</h2>
            <p className={styles.message}>
              Hand the device over, then start the turn.
            </p>
            <button
              type="button"
              className={styles.startButton}
              onClick={() => setHandoffTo(null)}
            >
              Start turn
            </button>
          </div>
        </div>
      ) : null}

      {winner ? (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h2>🏆 {winner} wins!</h2>
            <button
              type="button"
              className={styles.startButton}
              onClick={() => setMatch(null)}
            >
              Play again
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
