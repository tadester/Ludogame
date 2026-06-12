import { applyAction } from "./apply-action";
import { LudoRuleError } from "./types";
import type { MatchState, ReplayEntry } from "./types";

/**
 * Re-executes a recorded action log through the deterministic engine. Replay
 * never regenerates dice or repairs actions; any difference in produced
 * events or versions rejects the log.
 */
export function replayMatch(
  initialState: MatchState,
  entries: readonly ReplayEntry[],
): MatchState {
  let state = structuredClone(initialState);

  entries.forEach((entry, index) => {
    const result = applyAction(state, entry.action);
    if (
      result.state.version !== entry.stateVersion ||
      JSON.stringify(result.events) !== JSON.stringify(entry.events)
    ) {
      throw new LudoRuleError(
        "REPLAY_MISMATCH",
        `Replay entry ${index} does not match deterministic transition`,
      );
    }
    state = result.state;
  });

  return state;
}
