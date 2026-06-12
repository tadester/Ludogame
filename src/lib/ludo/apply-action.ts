import { createPlayer, createTokens } from "./create-match";
import { LudoRuleError } from "./types";
import type {
  ApplyActionResult,
  DomainEvent,
  MatchAction,
  MatchState,
} from "./types";

type ActionOf<Type extends MatchAction["type"]> = Extract<
  MatchAction,
  { type: Type }
>;

function applyJoinSeat(
  state: MatchState,
  action: ActionOf<"join-seat">,
): ApplyActionResult {
  if (state.status !== "lobby") {
    throw new LudoRuleError("INVALID_ACTION", "Match is not in the lobby");
  }
  const { id, displayName, color } = action.player;
  if (id === "") {
    throw new LudoRuleError("INVALID_ACTION", "Player ID is required");
  }
  if (displayName === "") {
    throw new LudoRuleError("INVALID_ACTION", "Display name is required");
  }
  if (state.players.some((player) => player.id === id)) {
    throw new LudoRuleError("INVALID_ACTION", `Player ${id} already joined`);
  }
  if (state.players.some((player) => player.color === color)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Color ${color} is already occupied`,
    );
  }
  if (state.players.length >= state.maxPlayers) {
    throw new LudoRuleError("INVALID_ACTION", "Match lobby is full");
  }

  const player = createPlayer(id, displayName, color);
  const events: DomainEvent[] = [
    { type: "player-joined", playerId: player.id, color: player.color },
  ];
  return {
    state: {
      ...state,
      players: [...state.players, player],
      tokens: [...state.tokens, ...createTokens(player)],
    },
    events,
  };
}

function applyStartMatch(
  state: MatchState,
  action: ActionOf<"start-match">,
): ApplyActionResult {
  if (state.status !== "lobby") {
    throw new LudoRuleError("INVALID_ACTION", "Match is not in the lobby");
  }
  if (action.playerId !== state.hostPlayerId) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Only the host can start the match",
    );
  }
  if (state.players.length !== state.maxPlayers) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Match requires ${state.maxPlayers} players before starting`,
    );
  }

  return {
    state: {
      ...state,
      status: "active",
      activePlayerIndex: 0,
      turnNumber: 1,
      phase: "awaiting-roll",
    },
    events: [{ type: "match-started", playerId: action.playerId }],
  };
}

function dispatchAction(
  state: MatchState,
  action: MatchAction,
): ApplyActionResult {
  switch (action.type) {
    case "join-seat":
      return applyJoinSeat(state, action);
    case "start-match":
      return applyStartMatch(state, action);
    default:
      throw new LudoRuleError(
        "INVALID_ACTION",
        `Action ${action.type} is not supported`,
      );
  }
}

export function applyAction(
  state: MatchState,
  action: MatchAction,
): ApplyActionResult {
  if (action.expectedVersion !== state.version) {
    throw new LudoRuleError(
      "STALE_VERSION",
      `Expected version ${state.version} but received ${action.expectedVersion}`,
    );
  }

  const result = dispatchAction(state, action);
  return {
    state: { ...result.state, version: state.version + 1 },
    events: result.events,
  };
}
