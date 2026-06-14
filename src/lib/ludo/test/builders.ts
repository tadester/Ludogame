import { applyAction, createMatch } from "@/lib/ludo";
import type { MatchState, PlayerColor, Ruleset } from "@/lib/ludo";

export function startedMatch(ruleset: Ruleset = "classic"): MatchState {
  let state = createMatch({
    id: `${ruleset}-match`,
    ruleset,
    maxPlayers: 2,
    host: { id: "p1", displayName: "Ada", color: "red" },
  });
  state = applyAction(state, {
    type: "join-seat",
    expectedVersion: state.version,
    player: { id: "p2", displayName: "Ben", color: "green" },
  }).state;
  return applyAction(state, {
    type: "start-match",
    expectedVersion: state.version,
    playerId: "p1",
  }).state;
}

export function withToken(
  state: MatchState,
  tokenId: string,
  progress: number | null,
): MatchState {
  return {
    ...state,
    tokens: state.tokens.map((token) =>
      token.id === tokenId
        ? {
            ...token,
            status:
              progress === null
                ? "yard"
                : progress === 57
                  ? "won"
                  : "active",
            progress,
          }
        : token,
    ),
  };
}

export function playerIdForColor(
  state: MatchState,
  color: PlayerColor,
): string {
  const player = state.players.find((candidate) => candidate.color === color);
  if (!player) {
    throw new Error(`No ${color} player`);
  }
  return player.id;
}
