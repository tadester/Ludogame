import { TOKENS_PER_PLAYER } from "./constants";
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
  return {
    state: {
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
    },
    events: [
      {
        type: "turn-advanced",
        fromPlayerId: mover.id,
        toPlayerId: state.players[nextIndex].id,
      },
    ],
  };
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
    tokens.length === TOKENS_PER_PLAYER &&
    tokens.every((token) => token.status === "won")
  );
}
