import { getClassicLegalActions } from "./classic";
import { PLAYER_COLORS } from "./constants";
import { stableStringify } from "./serialize";
import type { LegalAction, MatchState } from "./types";

export function sortLegalActions(actions: LegalAction[]): LegalAction[] {
  return actions.slice().sort((left, right) => {
    if (left.type !== right.type) {
      return left.type < right.type ? -1 : 1;
    }
    const leftKey = stableStringify(left);
    const rightKey = stableStringify(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function getLobbyLegalActions(state: MatchState): LegalAction[] {
  const actions: LegalAction[] = [];
  if (state.players.length < state.maxPlayers) {
    const usedColors = new Set(state.players.map((player) => player.color));
    for (const color of PLAYER_COLORS) {
      if (!usedColors.has(color)) {
        actions.push({
          type: "join-seat",
          expectedVersion: state.version,
          player: { id: "", displayName: "", color },
        });
      }
    }
  }
  if (state.players.length === state.maxPlayers) {
    actions.push({
      type: "start-match",
      expectedVersion: state.version,
      playerId: state.hostPlayerId,
    });
  }
  return sortLegalActions(actions);
}

export function getLegalActions(state: MatchState): LegalAction[] {
  if (state.status === "lobby") {
    return getLobbyLegalActions(state);
  }
  if (state.status === "completed") {
    return [];
  }
  if (state.ruleset === "classic") {
    return getClassicLegalActions(state);
  }
  return [];
}
