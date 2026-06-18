import { TOKENS_PER_PLAYER } from "./constants";
import { extremeLayout } from "./extreme-spawn";
import type {
  CreateMatchInput,
  MatchState,
  PlayerState,
  TokenState,
} from "./types";

export function createPlayer(
  id: string,
  displayName: string,
  color: PlayerState["color"],
): PlayerState {
  return {
    id,
    color,
    displayName,
    connected: true,
    forfeited: false,
    consecutiveTimeouts: 0,
  };
}

export function createTokens(player: PlayerState): TokenState[] {
  return Array.from({ length: TOKENS_PER_PLAYER }, (_, index) => ({
    id: `${player.id}-token-${index + 1}`,
    playerId: player.id,
    color: player.color,
    status: "yard" as const,
    progress: null,
  }));
}

export function createMatch(input: CreateMatchInput): MatchState {
  const host = createPlayer(
    input.host.id,
    input.host.displayName,
    input.host.color,
  );

  return {
    id: input.id,
    ruleset: input.ruleset,
    status: "lobby",
    version: 0,
    hostPlayerId: host.id,
    maxPlayers: input.maxPlayers,
    players: [host],
    tokens: createTokens(host),
    activePlayerIndex: 0,
    turnNumber: 0,
    rollNumber: 0,
    phase: "awaiting-roll",
    pendingRoll: null,
    winnerPlayerId: null,
    ...(input.ruleset === "extreme"
      ? {
          powerUps: {
            ...extremeLayout(input.id, 0),
            inventory: { [host.id]: [] },
            shieldedTokenIds: [],
            dashTokenIds: [],
            ultimate: { [host.id]: 0 },
            ultimateLoadout: { [host.id]: "meteor" },
            ultimateUses: { [host.id]: 0 },
          },
        }
      : {}),
  };
}
