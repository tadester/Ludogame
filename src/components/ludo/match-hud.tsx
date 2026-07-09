"use client";

import type { PlayerState, TokenState } from "@/lib/ludo";
import type { PlayerColor } from "@/lib/ludo-ui/geometry";

import { Dice } from "./dice";
import styles from "./match-hud.module.css";

const COLOR_CLASS: Record<PlayerColor, string> = {
  red: styles.colorRed,
  green: styles.colorGreen,
  yellow: styles.colorYellow,
  blue: styles.colorBlue,
};

interface MatchHudProps {
  readonly activePlayer: PlayerState | null;
  readonly currentPlayer?: PlayerState | null;
  readonly players: readonly PlayerState[];
  readonly tokens: readonly TokenState[];
  readonly status: string;
  readonly diceCount: number;
  readonly diceFaces: readonly number[];
  readonly rolling: boolean;
  readonly canRoll: boolean;
  readonly diceSkin?: string;
  readonly animationSkin?: string;
  readonly rollLabel?: string | null;
  readonly timerSeconds?: number | null;
  readonly ultimate?: {
    readonly label: string;
    readonly charge: number;
    readonly cost: number;
    readonly ready: boolean;
    readonly usesLabel: string;
  } | null;
  readonly onRoll: () => void;
}

export function MatchHud({
  activePlayer,
  currentPlayer,
  players,
  tokens,
  status,
  diceCount,
  diceFaces,
  rolling,
  canRoll,
  diceSkin = "classic",
  animationSkin = "standard",
  rollLabel = null,
  timerSeconds = null,
  ultimate = null,
  onRoll,
}: MatchHudProps) {
  return (
    <section className={styles.hud} aria-label="Match status">
      <div className={styles.topline}>
        <div>
          <p className={styles.label}>Current turn</p>
          <div
            className={`${styles.turn} ${
              activePlayer ? COLOR_CLASS[activePlayer.color] : ""
            }`}
          >
            {activePlayer ? <span className={styles.dot} aria-hidden="true" /> : null}
            <span>{activePlayer?.displayName ?? "Waiting"}</span>
          </div>
        </div>
        {currentPlayer ? (
          <span className={`${styles.identity} ${COLOR_CLASS[currentPlayer.color]}`}>
            You are {currentPlayer.color}
          </span>
        ) : null}
        <span
          className={styles.timer}
          data-low={
            typeof timerSeconds === "number" && timerSeconds <= 5
              ? "true"
              : undefined
          }
        >
          {typeof timerSeconds === "number"
            ? `Timer: ${timerSeconds}s`
            : "Timer: off"}
        </span>
      </div>

      <div className={styles.controls}>
        <div className={styles.diceGroup}>
          <div className={styles.diceRow}>
            {Array.from({ length: diceCount }, (_, index) => (
              <Dice
                key={index}
                value={diceFaces[index] ?? null}
                rolling={rolling}
                ready={canRoll}
                disabled={!canRoll}
                onRoll={onRoll}
                skin={diceSkin}
                animation={animationSkin}
              />
            ))}
          </div>
          {rollLabel ? <p className={styles.rollLabel}>{rollLabel}</p> : null}
        </div>
        <p className={styles.status}>{status}</p>
      </div>

      <div className={styles.players} aria-label="Players and colors">
        {players.map((player) => (
          <div
            key={player.id}
            className={`${styles.player} ${COLOR_CLASS[player.color]} ${
              player.id === activePlayer?.id ? styles.activePlayer : ""
            }`}
          >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.playerName}>{player.displayName}</span>
            <span className={styles.home}>
              {tokens.filter((token) => token.playerId === player.id && token.status === "won").length}
              /{tokens.filter((token) => token.playerId === player.id).length} home
            </span>
          </div>
        ))}
      </div>

      {ultimate ? (
        <div className={styles.meter}>
          <div className={styles.meterTrack} aria-hidden="true">
            <div
              className={styles.meterFill}
              style={{
                width: `${Math.min(100, (ultimate.charge / ultimate.cost) * 100)}%`,
              }}
            />
          </div>
          <p className={styles.status}>
            {ultimate.label} ultimate ·{" "}
            {ultimate.ready
              ? "ready"
              : `${Math.round((ultimate.charge / ultimate.cost) * 100)}% charged`}{" "}
            · {ultimate.usesLabel}
          </p>
        </div>
      ) : null}
    </section>
  );
}
