import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("Nigerian dice order", () => {
  it("requires two distinct stable die IDs", () => {
    const state = startedMatch("nigerian");
    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [{ id: "only-one", value: 6 }],
      }),
    ).toThrow("Nigerian rolls require exactly two dice");
    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [
          { id: "duplicate", value: 6 },
          { id: "duplicate", value: 2 },
        ],
      }),
    ).toThrow("Die IDs must be unique within a roll");
  });

  it("ends the turn when all tokens are in the yard and neither die is six", () => {
    const state = startedMatch("nigerian");
    const result = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "three", value: 3 },
        { id: "five", value: 5 },
      ],
    });
    expect(result.state.players[result.state.activePlayerIndex].id).toBe("p2");
    expect(result.state.pendingRoll).toBeNull();
  });

  it("offers both die orders when both produce a complete legal resolution", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p1-token-2", 20);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "die-2", value: 2 },
        { id: "die-5", value: 5 },
      ],
    }).state;

    expect(getLegalActions(rolled)).toEqual([
      {
        type: "select-die-order",
        expectedVersion: rolled.version,
        playerId: "p1",
        dieIds: ["die-2", "die-5"],
      },
      {
        type: "select-die-order",
        expectedVersion: rolled.version,
        playerId: "p1",
        dieIds: ["die-5", "die-2"],
      },
    ]);
  });

  it("rejects an order that would discard a die when another order uses both", () => {
    // Tokens 3 and 4 are already won so the six cannot release a yard token;
    // moving the one first could then strand the six on the home stretch.
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 51);
    state = withToken(state, "p1-token-2", 55);
    state = withToken(state, "p1-token-3", 57);
    state = withToken(state, "p1-token-4", 57);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "one", value: 1 },
        { id: "six", value: 6 },
      ],
    }).state;

    expect(getLegalActions(rolled)).toEqual([
      {
        type: "select-die-order",
        expectedVersion: rolled.version,
        playerId: "p1",
        dieIds: ["six", "one"],
      },
    ]);
  });
});
