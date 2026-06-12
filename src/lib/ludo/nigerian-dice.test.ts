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

describe("Nigerian release and die assignment", () => {
  it("uses six to release and then requires the other die on that token when all were in yard", () => {
    const state = startedMatch("nigerian");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "six", value: 6 },
        { id: "three", value: 3 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["six", "three"],
    }).state;
    const released = applyAction(ordered, {
      type: "release-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "six",
    }).state;

    expect(getLegalActions(released)).toEqual([
      {
        type: "move-token",
        expectedVersion: released.version,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieIds: ["three"],
      },
    ]);
  });

  it("allows double six to release two different tokens and grants one bonus roll", () => {
    const state = startedMatch("nigerian");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "six-a", value: 6 },
        { id: "six-b", value: 6 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["six-a", "six-b"],
    }).state;
    const first = applyAction(ordered, {
      type: "release-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "six-a",
    }).state;
    const result = applyAction(first, {
      type: "release-token",
      expectedVersion: first.version,
      playerId: "p1",
      tokenId: "p1-token-2",
      dieId: "six-b",
    });

    expect(
      result.state.tokens.filter((token) => token.progress === 0),
    ).toHaveLength(2);
    expect(result.state.phase).toBe("awaiting-roll");
    expect(result.events).toContainEqual({
      type: "bonus-roll-granted",
      playerId: "p1",
      reason: "double-six",
    });
  });

  it("assigns different dice to different playable tokens", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p1-token-2", 20);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "two", value: 2 },
        { id: "four", value: 4 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["two", "four"],
    }).state;
    const first = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["two"],
    }).state;
    const result = applyAction(first, {
      type: "move-token",
      expectedVersion: first.version,
      playerId: "p1",
      tokenId: "p1-token-2",
      dieIds: ["four"],
    });

    expect(
      result.state.tokens.find((token) => token.id === "p1-token-1")?.progress,
    ).toBe(12);
    expect(
      result.state.tokens.find((token) => token.id === "p1-token-2")?.progress,
    ).toBe(24);
  });
});

describe("Nigerian mandatory combined movement", () => {
  it("combines both dice when only one token can be played", () => {
    const state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "two", value: 2 },
        { id: "three", value: 3 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["two", "three"],
    }).state;

    expect(getLegalActions(ordered)).toEqual([
      {
        type: "move-token",
        expectedVersion: ordered.version,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieIds: ["two", "three"],
      },
    ]);
    const result = applyAction(ordered, getLegalActions(ordered)[0]);
    expect(
      result.state.tokens.find((token) => token.id === "p1-token-1")?.progress,
    ).toBe(15);
  });

  it("does not capture on the combined move's intermediate square", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p2-token-1", 1); // green progress 1 -> red ring 14
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "four", value: 4 },
        { id: "three", value: 3 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["four", "three"],
    }).state;
    const result = applyAction(ordered, getLegalActions(ordered)[0]);

    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "active", progress: 1 });
    expect(result.events).not.toContainEqual(
      expect.objectContaining({ type: "token-captured" }),
    );
  });
});
