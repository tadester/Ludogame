"use client";

import type { MatchState } from "@/lib/ludo";
import {
  chargeOf,
  equippedUltimate,
  ultimateCost,
  ultimateUsesLeft,
} from "@/lib/ludo/ultimate";
import { seatOwner } from "@/lib/ludo-online/authority";
import {
  POWER_DESC,
  POWER_LABEL,
  POWER_ORDER,
  ULTIMATE_DESC,
  ULTIMATE_LABEL,
  ULTIMATE_ORDER,
} from "@/lib/ludo-ui/powers-meta";

import styles from "./extreme-panel.module.css";

interface ExtremePanelProps {
  readonly state: MatchState;
  /** When set, the seat(s) this user controls are marked "(you)". */
  readonly userId?: string;
}

/** Live Extreme-mode status everyone can read: what the board symbols mean,
 *  each side's collected powers/shields/ultimate charge, and a quick reference
 *  for what every power does. */
export function ExtremePanel({ state, userId }: ExtremePanelProps) {
  const power = state.powerUps;
  if (state.ruleset !== "extreme" || !power) return null;

  return (
    <section className={styles.panel} aria-label="Extreme mode status">
      <div className={styles.legend}>
        <span>
          <b className={styles.star}>★</b> Safe square — no captures here
        </span>
        <span>
          <b className={styles.tile}>✦</b> Power tile — land on it to grab a power
        </span>
      </div>

      <ul className={styles.players}>
        {state.players
          .filter((player) => !player.forfeited)
          .map((player) => {
            const held = power.inventory?.[player.id] ?? [];
            const shields = state.tokens.filter(
              (token) =>
                token.playerId === player.id &&
                power.shieldedTokenIds.includes(token.id),
            ).length;
            const charge = chargeOf(state, player.id);
            const cost = ultimateCost(state, player.id);
            const usesLeft = ultimateUsesLeft(state, player.id);
            const pct = Math.min(100, Math.round((charge / cost) * 100));
            const ready = pct >= 100 && usesLeft > 0;
            const mine = userId ? seatOwner(player.id) === userId : false;
            return (
              <li
                key={player.id}
                className={styles.player}
                data-color={player.color}
              >
                <div className={styles.name}>
                  <span className={styles.dot} aria-hidden="true" />
                  {player.displayName}
                  {mine ? <span className={styles.you}> (you)</span> : null}
                </div>
                <div className={styles.stats}>
                  <span>
                    Powers:{" "}
                    {held.length
                      ? held.map((h) => POWER_LABEL[h]).join(", ")
                      : "none"}
                  </span>
                  {shields > 0 ? (
                    <span className={styles.shield}>
                      {shields} shield{shields > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <span className={ready ? styles.ready : undefined}>
                    {ULTIMATE_LABEL[equippedUltimate(state, player.id)]}:{" "}
                    {usesLeft <= 0 ? "spent" : ready ? "READY" : `${pct}%`}
                  </span>
                </div>
                <div className={styles.meter} aria-hidden="true">
                  <div className={styles.fill} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
      </ul>

      <details className={styles.help}>
        <summary>What does everything do?</summary>
        <ul>
          {POWER_ORDER.map((pw) => (
            <li key={pw}>
              <b>{POWER_LABEL[pw]}:</b> {POWER_DESC[pw]}
            </li>
          ))}
          {ULTIMATE_ORDER.map((ult) => (
            <li key={ult}>
              <b>{ULTIMATE_LABEL[ult]} (ultimate):</b> {ULTIMATE_DESC[ult]}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
