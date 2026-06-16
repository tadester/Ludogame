import { applyAction } from "./apply-action";
import { getLegalActions } from "./legal-actions";
import type {
  DomainEvent,
  MatchState,
  PlayableTurnAction,
  TurnSequence,
} from "./types";

/**
 * Every complete legal resolution of the current pending roll, in stable
 * order. A sequence ends once the roll is consumed, discarded, or completes
 * the match; it never includes a future roll, even after a bonus is granted.
 */
export function enumerateLegalTurnSequences(state: MatchState): TurnSequence[] {
  if (state.status !== "active") {
    return [];
  }
  const sequences: TurnSequence[] = [];

  function visit(
    current: MatchState,
    actions: readonly PlayableTurnAction[],
    events: readonly DomainEvent[],
  ): void {
    const legal = getLegalActions(current).filter(
      (action): action is PlayableTurnAction =>
        action.type === "select-die-order" ||
        action.type === "release-token" ||
        action.type === "move-token",
    );
    const rollResolved =
      current.pendingRoll === null || current.status === "completed";

    if (actions.length > 0 && rollResolved) {
      sequences.push({ actions, state: current, events });
      return;
    }

    for (const action of legal) {
      const result = applyAction(current, action);
      visit(result.state, [...actions, action], [...events, ...result.events]);
    }
  }

  visit(structuredClone(state), [], []);
  const unique = new Map(
    sequences.map((sequence) => [JSON.stringify(sequence.actions), sequence]),
  );
  return [...unique.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, sequence]) => sequence);
}
