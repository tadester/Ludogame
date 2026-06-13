import { applyAction, createMatch } from "@/lib/ludo";
import type { LegalAction, MatchAction, MatchState, Ruleset } from "@/lib/ludo";

import { PLAY_ORDER } from "./geometry";
import type { PlayerColor } from "./geometry";

export interface LocalPlayerSetup {
  readonly name: string;
}

export interface LocalSeat {
  readonly id: string;
  readonly color: PlayerColor;
  readonly displayName: string;
}

/** Builds a started pass-the-phone match with 2-4 seated human players. */
export function setupLocalMatch(
  players: readonly LocalPlayerSetup[],
  ruleset: Ruleset = "classic",
): MatchState {
  const seats = players.map<LocalSeat>((player, index) => ({
    id: `p${index + 1}`,
    color: PLAY_ORDER[index],
    displayName: player.name.trim() || defaultName(PLAY_ORDER[index]),
  }));

  let state = createMatch({
    id: `local-${Date.now()}`,
    ruleset,
    maxPlayers: seats.length as 2 | 3 | 4,
    host: seats[0],
  });

  for (const seat of seats.slice(1)) {
    state = applyAction(state, {
      type: "join-seat",
      expectedVersion: state.version,
      player: seat,
    }).state;
  }

  return applyAction(state, {
    type: "start-match",
    expectedVersion: state.version,
    playerId: seats[0].id,
  }).state;
}

export function defaultName(color: PlayerColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

/** A `roll-dice` action carrying a deterministic, replay-stable die id. */
export function rollAction(state: MatchState, value: number): MatchAction {
  const playerId = state.players[state.activePlayerIndex].id;
  return {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId,
    dice: [
      {
        id: `roll-${state.turnNumber}-${state.rollNumber}`,
        value: value as 1 | 2 | 3 | 4 | 5 | 6,
      },
    ],
  };
}

/** Maps each currently-movable token id to the legal action that moves it. */
export function legalMovesByToken(
  state: MatchState,
  actions: readonly LegalAction[],
): Map<string, LegalAction> {
  const byToken = new Map<string, LegalAction>();
  for (const action of actions) {
    if (action.type === "move-token" || action.type === "release-token") {
      byToken.set(action.tokenId, action);
    }
  }
  return byToken;
}

export function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}
