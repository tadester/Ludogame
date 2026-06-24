import { boardSpec } from "./board-spec";
import { EXTREME_RESPAWN_INTERVAL } from "./constants";
import { extremeLayout, respawnEpoch } from "./extreme-spawn";
import { applyMapEvent } from "./map-events";
import { chargeIncomingPlayer } from "./ultimate";
import { LudoRuleError } from "./types";
import type {
  Die,
  DomainEvent,
  MatchState,
  PlayerState,
  TokenState,
} from "./types";

export interface TransitionResult {
  readonly state: MatchState;
  readonly events: readonly DomainEvent[];
}

export function activePlayer(state: MatchState): PlayerState {
  return state.players[state.activePlayerIndex];
}

export function playerTokens(
  state: MatchState,
  playerId: string,
): TokenState[] {
  return state.tokens.filter((token) => token.playerId === playerId);
}

/** Whether two seats are controlled by the same team (so their tokens are
 *  allies that never capture each other). A seat is always its own ally. */
export function sameTeam(
  state: MatchState,
  a: string,
  b: string,
): boolean {
  if (a === b) return true;
  const teams = state.teams;
  if (!teams) return false;
  const teamA = teams[a];
  return teamA !== undefined && teamA === teams[b];
}

export function requireActiveMatch(state: MatchState): void {
  if (state.status !== "active") {
    throw new LudoRuleError("INVALID_ACTION", "Match is not active");
  }
}

export function requireActivePlayer(state: MatchState, playerId: string): void {
  if (activePlayer(state).id !== playerId) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Player ${playerId} is not the active player`,
    );
  }
}

export function validateDice(dice: readonly Die[]): void {
  if (dice.some((die) => die.id === "")) {
    throw new LudoRuleError("INVALID_ACTION", "Die IDs must be non-empty");
  }
  if (new Set(dice.map((die) => die.id)).size !== dice.length) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Die IDs must be unique within a roll",
    );
  }
}

export function nextNonForfeitedIndex(
  state: MatchState,
  fromIndex: number,
): number {
  const total = state.players.length;
  for (let step = 1; step <= total; step += 1) {
    const index = (fromIndex + step) % total;
    if (!state.players[index].forfeited) {
      return index;
    }
  }
  return fromIndex;
}

export function advanceTurn(state: MatchState): TransitionResult {
  const mover = activePlayer(state);
  const nextIndex = nextNonForfeitedIndex(state, state.activePlayerIndex);
  let advanced: MatchState = {
    ...state,
    players: state.players.map((player) =>
      player.id === mover.id && player.consecutiveTimeouts !== 0
        ? { ...player, consecutiveTimeouts: 0 }
        : player,
    ),
    activePlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    phase: "awaiting-roll",
    pendingRoll: null,
  };
  // Extreme: the player about to move charges their ultimate meter.
  advanced = { ...advanced, powerUps: chargeIncomingPlayer(advanced) };
  const events: DomainEvent[] = [
    {
      type: "turn-advanced",
      fromPlayerId: mover.id,
      toPlayerId: state.players[nextIndex].id,
    },
  ];

  // Extreme: safe squares and power tiles respawn at fresh random spots on a
  // fixed cadence, so the board keeps shifting fairly for everyone.
  if (
    advanced.ruleset === "extreme" &&
    advanced.powerUps &&
    advanced.turnNumber > 0 &&
    advanced.turnNumber % EXTREME_RESPAWN_INTERVAL === 0
  ) {
    const layout = extremeLayout(
      advanced.id,
      respawnEpoch(advanced.turnNumber, EXTREME_RESPAWN_INTERVAL),
    );
    advanced = {
      ...advanced,
      powerUps: {
        ...advanced.powerUps,
        tiles: layout.tiles,
        safeRingIndexes: layout.safeRingIndexes,
      },
    };
    events.push({ type: "power-tiles-refilled" });
  }

  // Extreme map events fire as the new turn begins, shaking up the board for
  // everyone equally.
  const mapEvent = applyMapEvent(advanced);
  if (mapEvent) {
    return { state: mapEvent.state, events: [...events, mapEvent.event] };
  }
  return { state: advanced, events };
}

export function grantBonusRoll(
  state: MatchState,
  reason: "six" | "double-six" | "home",
): TransitionResult {
  return {
    state: { ...state, phase: "awaiting-roll", pendingRoll: null },
    events: [
      { type: "bonus-roll-granted", playerId: activePlayer(state).id, reason },
    ],
  };
}

export function completeMatch(
  state: MatchState,
  winnerPlayerId: string,
): TransitionResult {
  return {
    state: {
      ...state,
      status: "completed",
      winnerPlayerId,
      phase: "awaiting-roll",
      pendingRoll: null,
    },
    events: [{ type: "match-completed", winnerPlayerId }],
  };
}

export function hasWonAllTokens(state: MatchState, playerId: string): boolean {
  const tokens = playerTokens(state, playerId);
  return (
    tokens.length === boardSpec(state.ruleset).tokensPerPlayer &&
    tokens.every((token) => token.status === "won")
  );
}

/** Whether a player has met the match win condition for the active ruleset.
 *  Blitz ends the moment a single token reaches home; every other mode needs
 *  all four. */
export function hasWonMatch(state: MatchState, playerId: string): boolean {
  if (state.ruleset === "blitz") {
    return playerTokens(state, playerId).some(
      (token) => token.status === "won",
    );
  }
  return hasWonAllTokens(state, playerId);
}
