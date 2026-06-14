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
  return rollActionFor(state, [value]);
}

/** How many dice the active ruleset rolls each turn. */
export function diceCountFor(ruleset: Ruleset): number {
  return ruleset === "nigerian" ? 2 : 1;
}

/** A `roll-dice` action for one or two dice with stable, unique ids. */
export function rollActionFor(
  state: MatchState,
  values: readonly number[],
): MatchAction {
  const playerId = state.players[state.activePlayerIndex].id;
  return {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId,
    dice: values.map((value, index) => ({
      id: `roll-${state.turnNumber}-${state.rollNumber}-${index}`,
      value: value as 1 | 2 | 3 | 4 | 5 | 6,
    })),
  };
}

/**
 * The token and from/to progress a release or move action produces, so the UI
 * can animate it without knowing ruleset-specific dice details.
 */
export function actionDestination(
  state: MatchState,
  action: LegalAction,
): { tokenId: string; from: number | null; to: number } | null {
  if (action.type === "release-token") {
    return { tokenId: action.tokenId, from: null, to: 0 };
  }
  if (action.type === "move-token") {
    const token = state.tokens.find((t) => t.id === action.tokenId);
    if (!token) return null;
    const dice = state.pendingRoll?.dice ?? [];
    const distance = action.dieIds.reduce(
      (sum, dieId) => sum + (dice.find((d) => d.id === dieId)?.value ?? 0),
      0,
    );
    const from = token.progress;
    return { tokenId: action.tokenId, from, to: (from ?? 0) + distance };
  }
  return null;
}

/** The die-order choices offered while awaiting a Nigerian die-order pick. */
export function dieOrderOptions(
  actions: readonly LegalAction[],
): { dieIds: readonly string[]; action: LegalAction }[] {
  return actions
    .filter((action) => action.type === "select-die-order")
    .map((action) => ({
      dieIds: (action as { dieIds: readonly string[] }).dieIds,
      action,
    }));
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
