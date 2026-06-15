import { applyAction, enumerateLegalTurnSequences } from "@/lib/ludo";
import type { ApplyActionResult, DomainEvent, MatchState } from "@/lib/ludo";

import { serverRoll } from "./authority";
import type { DiceRng } from "./authority";

export interface TimeoutOptions {
  /** Server dice source, used when the player had not yet rolled. */
  readonly rng: DiceRng;
  /** Choose which of the `count` complete legal turns to play. Defaults to the
   *  first (deterministic); production passes a random selector. */
  readonly selectSequence?: (count: number) => number;
}

function clampIndex(value: number, count: number): number {
  if (!Number.isFinite(value)) return 0;
  const index = Math.floor(value);
  if (index < 0) return 0;
  if (index >= count) return count - 1;
  return index;
}

/**
 * Resolve an expired turn timer for the active player. If they had not rolled,
 * the server rolls for them; when that roll leaves a playable pending roll, a
 * complete legal turn is selected and applied via `resolve-timeout` (which the
 * engine counts toward the three-strike forfeit). A roll that ends the turn on
 * its own is returned as-is.
 */
export function resolveTurnTimeout(
  state: MatchState,
  options: TimeoutOptions,
): ApplyActionResult {
  if (state.status !== "active") {
    throw new Error("The match is not in progress.");
  }

  const player = state.players[state.activePlayerIndex];
  let working = state;
  let events: DomainEvent[] = [];

  if (working.phase === "awaiting-roll") {
    const dice = serverRoll(working, options.rng);
    const rolled = applyAction(working, {
      type: "roll-dice",
      expectedVersion: working.version,
      playerId: player.id,
      dice,
    });
    working = rolled.state;
    events = [...rolled.events];
  }

  const stillTheirTurn =
    working.status === "active" &&
    working.players[working.activePlayerIndex]?.id === player.id &&
    working.pendingRoll !== null;
  if (!stillTheirTurn) {
    return { state: working, events };
  }

  const sequences = enumerateLegalTurnSequences(working);
  if (sequences.length === 0) {
    return { state: working, events };
  }

  const index = clampIndex(
    options.selectSequence?.(sequences.length) ?? 0,
    sequences.length,
  );
  const resolved = applyAction(working, {
    type: "resolve-timeout",
    expectedVersion: working.version,
    playerId: player.id,
    sequence: sequences[index].actions,
  });

  return { state: resolved.state, events: [...events, ...resolved.events] };
}

/** Mark a player connected or disconnected. */
export function setConnection(
  state: MatchState,
  playerId: string,
  connected: boolean,
): ApplyActionResult {
  return applyAction(state, {
    type: "set-connection",
    expectedVersion: state.version,
    playerId,
    connected,
  });
}

/** Forfeit a player (e.g. after the reconnect window closes). */
export function forfeitPlayer(
  state: MatchState,
  playerId: string,
): ApplyActionResult {
  return applyAction(state, {
    type: "forfeit-player",
    expectedVersion: state.version,
    playerId,
  });
}
