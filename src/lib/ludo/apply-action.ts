import { createPlayer, createTokens } from "./create-match";
import type {
  ApplyActionResult,
  MatchAction,
  MatchState,
  PlayerColor,
} from "./types";
import { LudoRuleError } from "./types";

function rejectInvalid(message: string): never {
  throw new LudoRuleError("INVALID_ACTION", message);
}

function applyJoinSeat(
  state: MatchState,
  player: {
    readonly id: string;
    readonly displayName: string;
    readonly color: PlayerColor;
  },
): ApplyActionResult {
  if (state.status !== "lobby") {
    rejectInvalid("Players can only join a match lobby");
  }
  if (!player.id.trim()) {
    rejectInvalid("Player ID is required");
  }
  if (!player.displayName.trim()) {
    rejectInvalid("Display name is required");
  }
  if (state.players.some((candidate) => candidate.id === player.id)) {
    rejectInvalid(`Player ${player.id} already joined`);
  }
  if (state.players.some((candidate) => candidate.color === player.color)) {
    rejectInvalid(`Color ${player.color} is already occupied`);
  }
  if (state.players.length >= state.maxPlayers) {
    rejectInvalid("Match lobby is full");
  }

  const joinedPlayer = createPlayer(
    player.id,
    player.displayName.trim(),
    player.color,
  );

  return {
    state: {
      ...state,
      version: state.version + 1,
      players: [...state.players, joinedPlayer],
      tokens: [...state.tokens, ...createTokens(joinedPlayer)],
    },
    events: [
      {
        type: "player-joined",
        playerId: joinedPlayer.id,
        color: joinedPlayer.color,
      },
    ],
  };
}

function applyStartMatch(
  state: MatchState,
  playerId: string,
): ApplyActionResult {
  if (state.status !== "lobby") {
    rejectInvalid("Only a match lobby can be started");
  }
  if (playerId !== state.hostPlayerId) {
    rejectInvalid("Only the host can start the match");
  }
  if (state.players.length !== state.maxPlayers) {
    rejectInvalid(
      `Match requires ${state.maxPlayers} players before starting`,
    );
  }

  return {
    state: {
      ...state,
      status: "active",
      version: state.version + 1,
      activePlayerIndex: 0,
      turnNumber: 1,
      phase: "awaiting-roll",
    },
    events: [{ type: "match-started", playerId }],
  };
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

  switch (action.type) {
    case "join-seat":
      return applyJoinSeat(state, action.player);
    case "start-match":
      return applyStartMatch(state, action.playerId);
    default:
      return rejectInvalid(`Action ${action.type} is not available`);
  }
}
