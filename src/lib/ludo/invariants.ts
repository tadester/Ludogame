import {
  HOME_LANE_PROGRESS_MAX,
  TOKENS_PER_PLAYER,
  WON_PROGRESS,
} from "./constants";
import { LudoRuleError } from "./types";
import type { MatchState, PendingRoll } from "./types";

function fail(message: string): never {
  throw new LudoRuleError("INVALID_STATE", message);
}

function assertPlayers(state: MatchState): void {
  if (new Set(state.players.map((player) => player.id)).size !==
      state.players.length) {
    fail("Player IDs must be unique");
  }
  if (new Set(state.players.map((player) => player.color)).size !==
      state.players.length) {
    fail("Player colors must be unique");
  }
  if (
    state.activePlayerIndex < 0 ||
    state.activePlayerIndex >= state.players.length
  ) {
    fail(`Active player index ${state.activePlayerIndex} is out of bounds`);
  }
  if (
    state.status === "active" &&
    state.players[state.activePlayerIndex].forfeited
  ) {
    fail("Active player must not be forfeited");
  }
}

function assertTokens(state: MatchState): void {
  if (new Set(state.tokens.map((token) => token.id)).size !==
      state.tokens.length) {
    fail("Token IDs must be unique");
  }
  const playersById = new Map(
    state.players.map((player) => [player.id, player]),
  );
  for (const token of state.tokens) {
    const owner = playersById.get(token.playerId);
    if (!owner) {
      fail(`Token ${token.id} has unknown owner ${token.playerId}`);
    }
    if (token.color !== owner.color) {
      fail(`Token ${token.id} color must match its owner`);
    }
    if (token.status === "yard" && token.progress !== null) {
      fail(`Yard token ${token.id} must have null progress`);
    }
    if (
      token.status === "active" &&
      (token.progress === null ||
        !Number.isInteger(token.progress) ||
        token.progress < 0 ||
        token.progress > HOME_LANE_PROGRESS_MAX)
    ) {
      fail(`Active token ${token.id} must have progress 0 through 56`);
    }
    if (token.status === "won" && token.progress !== WON_PROGRESS) {
      fail(`Won token ${token.id} must have progress 57`);
    }
  }
  for (const player of state.players) {
    const owned = state.tokens.filter(
      (token) => token.playerId === player.id,
    ).length;
    if (player.forfeited && owned !== 0) {
      fail(`Forfeited player ${player.id} must own no tokens`);
    }
    if (!player.forfeited && owned !== TOKENS_PER_PLAYER) {
      fail(`Player ${player.id} must own exactly four tokens`);
    }
  }
}

function assertPendingRoll(state: MatchState, roll: PendingRoll): void {
  const expectedDice = state.ruleset === "classic" ? 1 : 2;
  if (roll.dice.length !== expectedDice) {
    fail(
      `${state.ruleset === "classic" ? "Classic" : "Nigerian"} pending rolls must contain exactly ${expectedDice === 1 ? "one die" : "two dice"}`,
    );
  }
  if (roll.dice.some((die) => die.id === "")) {
    fail("Pending die IDs must be non-empty");
  }
  const dieIds = new Set(roll.dice.map((die) => die.id));
  if (dieIds.size !== roll.dice.length) {
    fail("Pending die IDs must be unique");
  }
  for (const listName of ["remainingDieIds", "selectedDieOrder"] as const) {
    const list = roll[listName];
    if (list === null) {
      continue;
    }
    if (list.some((dieId) => !dieIds.has(dieId))) {
      fail(`Pending ${listName} must reference rolled dice`);
    }
    if (new Set(list).size !== list.length) {
      fail(`Pending ${listName} must not repeat dice`);
    }
  }
  if (
    roll.forcedTokenId !== null &&
    !state.tokens.some((token) => token.id === roll.forcedTokenId)
  ) {
    fail(`Forced token ${roll.forcedTokenId} does not exist`);
  }
}

function assertStatusAndPhase(state: MatchState): void {
  if (state.status === "lobby") {
    if (state.pendingRoll !== null) {
      fail("Lobby matches must have no pending roll");
    }
    if (state.turnNumber !== 0) {
      fail("Lobby matches must have turn number 0");
    }
    if (state.winnerPlayerId !== null) {
      fail("Lobby matches must have no winner");
    }
    return;
  }

  if (
    (state.phase === "awaiting-die-order" || state.phase === "awaiting-move") &&
    state.pendingRoll === null
  ) {
    fail(`Phase ${state.phase} requires a pending roll`);
  }

  if (state.status === "active") {
    if (state.winnerPlayerId !== null) {
      fail("Active matches must have no winner");
    }
    if (state.phase === "awaiting-roll" && state.pendingRoll !== null) {
      fail("Awaiting-roll states must have no pending roll");
    }
    return;
  }

  const winner = state.players.find(
    (player) => player.id === state.winnerPlayerId,
  );
  if (!winner) {
    fail("Completed matches must have a valid winner");
  }
  if (state.pendingRoll !== null) {
    fail("Completed matches must have no pending roll");
  }
  const opponentsForfeited = state.players
    .filter((player) => player.id !== winner.id)
    .every((player) => player.forfeited);
  if (!opponentsForfeited) {
    const wonTokens = state.tokens.filter(
      (token) => token.playerId === winner.id && token.status === "won",
    ).length;
    if (wonTokens !== TOKENS_PER_PLAYER) {
      fail("A gameplay winner must have four won tokens");
    }
  }
}

export function assertMatchInvariants(state: MatchState): void {
  assertPlayers(state);
  assertTokens(state);
  if (state.pendingRoll !== null) {
    assertPendingRoll(state, state.pendingRoll);
  }
  assertStatusAndPhase(state);
}
