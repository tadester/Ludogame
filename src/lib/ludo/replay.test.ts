import { describe, expect, it } from "vitest";

import { applyAction, replayMatch } from "@/lib/ludo";
import type { MatchAction, ReplayEntry } from "@/lib/ludo";
import { startedMatch } from "@/lib/ludo/test/builders";

describe("replayMatch", () => {
  it("reproduces identical state and events from stable-ID actions", () => {
    const initial = startedMatch("classic");
    const actions: MatchAction[] = [
      {
        type: "roll-dice",
        expectedVersion: initial.version,
        playerId: "p1",
        dice: [{ id: "turn-1-roll-1-die-1", value: 6 }],
      },
      {
        type: "release-token",
        expectedVersion: initial.version + 1,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieId: "turn-1-roll-1-die-1",
      },
    ];
    let state = initial;
    const entries: ReplayEntry[] = actions.map((action) => {
      const result = applyAction(state, action);
      state = result.state;
      return {
        action,
        events: result.events,
        stateVersion: result.state.version,
      };
    });

    expect(replayMatch(initial, entries)).toEqual(state);
  });

  it("rejects altered events and version gaps", () => {
    const initial = startedMatch("classic");
    expect(() =>
      replayMatch(initial, [
        {
          action: {
            type: "roll-dice",
            expectedVersion: initial.version,
            playerId: "p1",
            dice: [{ id: "five", value: 5 }],
          },
          events: [],
          stateVersion: initial.version + 2,
        },
      ]),
    ).toThrow("Replay entry 0 does not match deterministic transition");
  });
});
