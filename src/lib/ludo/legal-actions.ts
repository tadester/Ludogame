import { PLAYER_COLORS } from "./constants";
import type { LegalAction, MatchState } from "./types";

function actionSortKey(action: LegalAction) {
  switch (action.type) {
    case "join-seat":
      return `${action.type}:${action.player.color}:${action.player.id}`;
    case "start-match":
    case "roll-dice":
    case "resolve-timeout":
    case "set-connection":
    case "forfeit-player":
      return `${action.type}:${action.playerId}`;
    case "select-die-order":
      return `${action.type}:${action.playerId}:${action.dieIds.join(",")}`;
    case "release-token":
      return `${action.type}:${action.playerId}:${action.tokenId}:${action.dieId}`;
    case "move-token":
      return `${action.type}:${action.playerId}:${action.tokenId}:${action.dieIds.join(",")}`;
  }
}

export function getLegalActions(state: MatchState): LegalAction[] {
  if (state.status !== "lobby") {
    return [];
  }

  const actions: LegalAction[] = [];

  if (state.players.length < state.maxPlayers) {
    const occupiedColors = new Set(state.players.map((player) => player.color));

    for (const color of PLAYER_COLORS) {
      if (!occupiedColors.has(color)) {
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

  return actions.sort((left, right) =>
    actionSortKey(left).localeCompare(actionSortKey(right)),
  );
}
