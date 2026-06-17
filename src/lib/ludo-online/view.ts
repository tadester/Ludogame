import { getLegalActions } from "@/lib/ludo";
import type { MatchState, TurnPhase } from "@/lib/ludo";
import { seatOwner } from "@/lib/ludo-online/authority";
import { dieOrderOptions, legalMovesByToken } from "@/lib/ludo-ui/local-game";

export interface DieOrderOption {
  readonly dieIds: readonly string[];
}

/** What the given user can see and do in the current snapshot. Pure, so it is
 *  unit tested and shared between the client controller and its tests. */
export interface OnlineView {
  readonly isMyTurn: boolean;
  readonly canRoll: boolean;
  readonly phase: TurnPhase;
  readonly movableTokenIds: readonly string[];
  readonly dieOrderOptions: readonly DieOrderOption[];
  readonly activeName: string;
  readonly winnerName: string | null;
}

export function onlineViewModel(state: MatchState, userId: string): OnlineView {
  const active = state.players[state.activePlayerIndex];
  const isMyTurn =
    state.status === "active" && !!active && seatOwner(active.id) === userId;

  const winnerName = state.winnerPlayerId
    ? (state.players.find((p) => p.id === state.winnerPlayerId)?.displayName ??
      null)
    : null;

  let canRoll = false;
  let movableTokenIds: readonly string[] = [];
  let orderOptions: readonly DieOrderOption[] = [];

  if (isMyTurn) {
    const actions = getLegalActions(state);
    if (state.phase === "awaiting-roll") {
      canRoll = actions.some((a) => a.type === "roll-dice");
    } else if (state.phase === "awaiting-move") {
      movableTokenIds = [...legalMovesByToken(state, actions).keys()];
    } else if (state.phase === "awaiting-die-order") {
      orderOptions = dieOrderOptions(actions).map((o) => ({ dieIds: o.dieIds }));
    }
  }

  return {
    isMyTurn,
    canRoll,
    phase: state.phase,
    movableTokenIds,
    dieOrderOptions: orderOptions,
    activeName: active?.displayName ?? "",
    winnerName,
  };
}
