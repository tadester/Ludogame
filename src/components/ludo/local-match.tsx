"use client";

import { useCallback, useMemo, useState } from "react";

import { applyAction, getLegalActions } from "@/lib/ludo";
import type { DomainEvent, MatchState } from "@/lib/ludo";
import { moveWaypoints } from "@/lib/ludo-ui/geometry";
import type { Cell, PlayerColor } from "@/lib/ludo-ui/geometry";
import {
  defaultName,
  legalMovesByToken,
  rollAction,
  rollDie,
  setupLocalMatch,
} from "@/lib/ludo-ui/local-game";

import { Dice } from "./dice";
import { LudoBoard } from "./ludo-board";
import styles from "./local-match.module.css";

const SETUP_COLORS: PlayerColor[] = ["red", "green", "yellow", "blue"];
const STEP_MS = 165;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const COLOR_CLASS: Record<PlayerColor, string> = {
  red: styles.colorRed,
  green: styles.colorGreen,
  yellow: styles.colorYellow,
  blue: styles.colorBlue,
};

export function LocalMatch() {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dieFace, setDieFace] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [override, setOverride] = useState<{
    tokenId: string;
    cell: Cell;
  } | null>(null);
  const [captured, setCaptured] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState("");
  const [winner, setWinner] = useState<string | null>(null);

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

  const activePlayer = match ? match.players[match.activePlayerIndex] : null;

  const start = useCallback(() => {
    const next = setupLocalMatch(
      Array.from({ length: count }, (_, i) => ({ name: names[i] ?? "" })),
    );
    setMatch(next);
    setWinner(null);
    setDieFace(null);
    setOverride(null);
    setCaptured(new Set());
    const name = next.players[next.activePlayerIndex].displayName;
    setMessage(`${name} to roll.`);
  }, [count, names]);

  const announce = useCallback(
    (next: MatchState, events: readonly DomainEvent[]) => {
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

      const nextName = next.players[next.activePlayerIndex].displayName;
      const bonus = events.some((e) => e.type === "bonus-roll-granted");
      if (capturedIds.length > 0) {
        setMessage(`Capture! ${nextName} rolls again.`);
      } else if (bonus) {
        setMessage(`Bonus roll — ${nextName} goes again.`);
      } else {
        setMessage(`${nextName}'s turn — roll the dice.`);
      }
    },
    [],
  );

  const handleRoll = useCallback(async () => {
    if (!match || busy || match.phase !== "awaiting-roll") return;

    setBusy(true);
    setRolling(true);
    const value = rollDie();
    for (let i = 0; i < 9; i += 1) {
      setDieFace(rollDie());
      await sleep(55);
    }
    setDieFace(value);
    setRolling(false);

    const roller = match.players[match.activePlayerIndex];
    const result = applyAction(match, rollAction(match, value));
    setMatch(result.state);

    if (result.state.phase === "awaiting-move") {
      setMessage(`${roller.displayName} rolled ${value} — pick a token to move.`);
    } else {
      const nextName =
        result.state.players[result.state.activePlayerIndex].displayName;
      setMessage(
        `${roller.displayName} rolled ${value}. No moves — ${nextName}'s turn.`,
      );
    }
    setBusy(false);
  }, [match, busy]);

  const handleToken = useCallback(
    async (tokenId: string) => {
      if (!match || busy || match.phase !== "awaiting-move") return;
      const action = legalMovesByToken(match, getLegalActions(match)).get(
        tokenId,
      );
      if (!action) return;

      setBusy(true);
      const token = match.tokens.find((t) => t.id === tokenId)!;
      const die = match.pendingRoll!.dice[0].value;
      const to = token.progress === null ? 0 : token.progress + die;

      for (const cell of moveWaypoints(token.color, token.progress, to)) {
        setOverride({ tokenId, cell });
        await sleep(STEP_MS);
      }

      const result = applyAction(match, action);
      setOverride(null);
      setMatch(result.state);
      announce(result.state, result.events);
      setBusy(false);
    },
    [match, busy, announce],
  );

  if (!match) {
    return (
      <div className={styles.setup}>
        <h1>Pass &amp; play</h1>
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
      </div>
    );
  }

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
            <Dice
              value={dieFace}
              rolling={rolling}
              ready={!busy && match.phase === "awaiting-roll" && !winner}
              disabled={busy || match.phase !== "awaiting-roll" || !!winner}
              onRoll={handleRoll}
            />
            <p className={styles.message}>{message}</p>
          </div>

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

          <button
            type="button"
            className={styles.newGame}
            onClick={() => setMatch(null)}
          >
            New game
          </button>
        </aside>
      </div>

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
