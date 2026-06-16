import { applyClassicAction } from "./classic";
import { createPlayer, createTokens } from "./create-match";
import { assertMatchInvariants } from "./invariants";
import { getLegalActions } from "./legal-actions";
import { applyNigerianAction } from "./nigerian";
import { deepEquals } from "./serialize";
import {
  activePlayer,
  completeMatch,
  nextNonForfeitedIndex,
  requireActiveMatch,
  requireActivePlayer,
} from "./turn-flow";
import { enumerateLegalTurnSequences } from "./turn-sequences";
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

function requirePlayer(state: MatchState, playerId: string): void {
  if (!state.players.some((player) => player.id === playerId)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Player ${playerId} is not in this match`,
    );
  }
}

function applySetConnection(
  state: MatchState,
  action: ActionOf<"set-connection">,
): ApplyActionResult {
  requirePlayer(state, action.playerId);
  return {
    state: {
      ...state,
      players: state.players.map((player) =>
        player.id === action.playerId
          ? { ...player, connected: action.connected }
          : player,
      ),
    },
    events: [
      {
        type: "connection-changed",
        playerId: action.playerId,
        connected: action.connected,
      },
    ],
  };
}

export function forfeitPlayer(
  state: MatchState,
  playerId: string,
): ApplyActionResult {
  const wasActivePlayer = activePlayer(state).id === playerId;
  let next: MatchState = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, forfeited: true } : player,
    ),
    tokens: state.tokens.filter((token) => token.playerId !== playerId),
  };
  const events: DomainEvent[] = [{ type: "player-forfeited", playerId }];

  const remaining = next.players.filter((player) => !player.forfeited);
  if (remaining.length === 1) {
    const winnerIndex = next.players.findIndex(
      (player) => player.id === remaining[0].id,
    );
    const completed = completeMatch(
      { ...next, activePlayerIndex: winnerIndex },
      remaining[0].id,
    );
    return {
      state: completed.state,
      events: [...events, ...completed.events],
    };
  }

  if (wasActivePlayer) {
    const nextIndex = nextNonForfeitedIndex(next, next.activePlayerIndex);
    events.push({
      type: "turn-advanced",
      fromPlayerId: playerId,
      toPlayerId: next.players[nextIndex].id,
    });
    next = {
      ...next,
      activePlayerIndex: nextIndex,
      turnNumber: next.turnNumber + 1,
      phase: "awaiting-roll",
      pendingRoll: null,
    };
  }
  return { state: next, events };
}

function applyForfeitPlayer(
  state: MatchState,
  action: ActionOf<"forfeit-player">,
): ApplyActionResult {
  requireActiveMatch(state);
  requirePlayer(state, action.playerId);
  if (
    state.players.find((player) => player.id === action.playerId)!.forfeited
  ) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Player ${action.playerId} already forfeited`,
    );
  }
  return forfeitPlayer(state, action.playerId);
}

function applyResolveTimeout(
  state: MatchState,
  action: ActionOf<"resolve-timeout">,
): ApplyActionResult {
  requireActiveMatch(state);
  requireActivePlayer(state, action.playerId);
  const match = enumerateLegalTurnSequences(state).find((sequence) =>
    deepEquals(sequence.actions, action.sequence),
  );
  if (!match) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Timeout sequence is not a complete legal turn",
    );
  }

  const previousTimeouts = state.players.find(
    (player) => player.id === action.playerId,
  )!.consecutiveTimeouts;
  const consecutiveTimeouts = previousTimeouts + 1;
  const adopted: MatchState = {
    ...match.state,
    players: match.state.players.map((player) =>
      player.id === action.playerId
        ? { ...player, consecutiveTimeouts }
        : player,
    ),
  };
  const events: DomainEvent[] = [
    ...match.events,
    { type: "turn-timed-out", playerId: action.playerId, consecutiveTimeouts },
  ];

  if (consecutiveTimeouts >= 3 && adopted.status === "active") {
    const forfeited = forfeitPlayer(adopted, action.playerId);
    return {
      state: forfeited.state,
      events: [...events, ...forfeited.events],
    };
  }
  return { state: adopted, events };
}

function applyRulesetAction(
  state: MatchState,
  action: MatchAction,
): ApplyActionResult {
  if (state.ruleset === "classic") {
    return applyClassicAction(state, action);
  }
  return applyNigerianAction(state, action);
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
    case "set-connection":
      return applySetConnection(state, action);
    case "forfeit-player":
      return applyForfeitPlayer(state, action);
    case "resolve-timeout":
      return applyResolveTimeout(state, action);
    case "roll-dice":
      requireActiveMatch(state);
      return applyRulesetAction(state, action);
    case "select-die-order":
    case "release-token":
    case "move-token": {
      requireActiveMatch(state);
      const legal = getLegalActions(state).some((candidate) =>
        deepEquals(candidate, action),
      );
      if (!legal) {
        throw new LudoRuleError(
          "INVALID_ACTION",
          `Action ${action.type} is not legal in the current state`,
        );
      }
      return applyRulesetAction(state, action);
    }
  }
}

export function applyAction(
  state: MatchState,
  action: MatchAction,
): ApplyActionResult {
  assertMatchInvariants(state);
  if (action.expectedVersion !== state.version) {
    throw new LudoRuleError(
      "STALE_VERSION",
      `Expected version ${state.version} but received ${action.expectedVersion}`,
    );
  }

  const result = dispatchAction(state, action);
  const next = { ...result.state, version: state.version + 1 };
  assertMatchInvariants(next);
  return { state: next, events: result.events };
}
