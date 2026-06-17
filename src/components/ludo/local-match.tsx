"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { applyAction, getLegalActions } from "@/lib/ludo";
import type { DomainEvent, MatchState, Ruleset } from "@/lib/ludo";
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

import { Dice } from "./dice";
import { LudoBoard } from "./ludo-board";
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
    savePreferences({ count, ruleset, names });
    const next = setupLocalMatch(
      Array.from({ length: count }, (_, i) => ({ name: names[i] ?? "" })),
      ruleset,
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
      setMessage(prefix + status);
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
    (power: "shield" | "dash", tokenId: string) => {
      if (!match || busy || match.phase !== "awaiting-roll") return;
      const result = applyAction(match, {
        type: "use-power",
        expectedVersion: match.version,
        playerId: match.players[match.activePlayerIndex].id,
        power,
        tokenId,
      });
      setMatch(result.state);
      resolve(
        result.state,
        result.events,
        power === "shield" ? "Shield raised. " : "Dash armed. ",
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
      <div className={styles.layout}>
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
                const held = match.powerUps?.inventory[activePlayer.id] ?? [];
                const shields = held.filter((p) => p === "shield").length;
                const dashes = held.filter((p) => p === "dash").length;
                const canUse = !busy && match.phase === "awaiting-roll";
                const myActive = match.tokens.filter(
                  (t) =>
                    t.playerId === activePlayer.id && t.status === "active",
                );
                return (
                  <div className={styles.dieOrders}>
                    <p className={styles.message}>
                      Shields: {shields} · Dashes: {dashes}
                    </p>
                    {canUse && shields > 0
                      ? myActive
                          .filter(
                            (t) =>
                              !match.powerUps?.shieldedTokenIds.includes(t.id),
                          )
                          .map((t) => (
                            <button
                              key={`shield-${t.id}`}
                              type="button"
                              className={styles.segmentButton}
                              onClick={() => handleUsePower("shield", t.id)}
                            >
                              Shield {t.color} #{t.id.split("-").at(-1)}
                            </button>
                          ))
                      : null}
                    {canUse && dashes > 0
                      ? myActive
                          .filter(
                            (t) => !match.powerUps?.dashTokenIds.includes(t.id),
                          )
                          .map((t) => (
                            <button
                              key={`dash-${t.id}`}
                              type="button"
                              className={styles.segmentButton}
                              onClick={() => handleUsePower("dash", t.id)}
                            >
                              Dash {t.color} #{t.id.split("-").at(-1)}
                            </button>
                          ))
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
