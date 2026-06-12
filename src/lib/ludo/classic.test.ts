import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("Classic rolling and release", () => {
  it("requires exactly one stable-ID die", () => {
    const state = startedMatch("classic");

    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [
          { id: "die-a", value: 3 },
          { id: "die-b", value: 4 },
        ],
      }),
    ).toThrow("Classic rolls require exactly one die");
  });

  it("ends the turn when every token is in the yard and the die is not six", () => {
    const state = startedMatch("classic");
    const result = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "turn-1-roll-1-die-1", value: 5 }],
    });

    expect(result.state.players[result.state.activePlayerIndex].id).toBe("p2");
    expect(result.state.phase).toBe("awaiting-roll");
    expect(result.state.pendingRoll).toBeNull();
  });

  it("offers a release for each yard token on six and preserves the die ID", () => {
    const state = startedMatch("classic");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "stable-six", value: 6 }],
    }).state;

    expect(getLegalActions(rolled)).toContainEqual({
      type: "release-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "stable-six",
    });

    const released = applyAction(rolled, {
      type: "release-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "stable-six",
    });
    expect(
      released.state.tokens.find((token) => token.id === "p1-token-1"),
    ).toMatchObject({ status: "active", progress: 0 });
    expect(released.state.phase).toBe("awaiting-roll");
    expect(released.events).toContainEqual({
      type: "bonus-roll-granted",
      playerId: "p1",
      reason: "six",
    });
  });

  it("allows a six to move an active token instead of releasing", () => {
    const state = withToken(startedMatch("classic"), "p1-token-1", 7);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "six", value: 6 }],
    }).state;

    expect(getLegalActions(rolled)).toContainEqual({
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["six"],
    });
  });
});

describe("Classic movement and captures", () => {
  it("captures every opposing token on a non-safe destination", () => {
    let state = withToken(startedMatch("classic"), "p1-token-1", 4);
    state = withToken(state, "p2-token-1", 46); // green progress 46 -> ring 7
    state = withToken(state, "p2-token-2", 46);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "move-3", value: 3 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["move-3"],
    });

    expect(
      result.state.tokens.filter((token) => token.id.startsWith("p2-token-")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "p2-token-1",
          status: "yard",
          progress: null,
        }),
        expect.objectContaining({
          id: "p2-token-2",
          status: "yard",
          progress: null,
        }),
      ]),
    );
    expect(
      result.events.filter((event) => event.type === "token-captured"),
    ).toHaveLength(2);
  });

  it.each([8, 13, 21, 26, 34, 39, 47])(
    "does not capture on Classic safe ring index %i",
    (safeIndex) => {
      let state = withToken(
        startedMatch("classic"),
        "p1-token-1",
        safeIndex - 1 < 0 ? 51 : safeIndex - 1,
      );
      const greenProgress = (safeIndex - 13 + 52) % 52;
      state = withToken(state, "p2-token-1", greenProgress);
      const rolled = applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [{ id: `safe-${safeIndex}`, value: 1 }],
      }).state;
      const result = applyAction(rolled, {
        type: "move-token",
        expectedVersion: rolled.version,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieIds: [`safe-${safeIndex}`],
      });

      expect(
        result.state.tokens.find((token) => token.id === "p2-token-1"),
      ).toMatchObject({ status: "active", progress: greenProgress });
    },
  );

  it("does not capture when releasing onto the red Classic safe opening", () => {
    let state = startedMatch("classic");
    state = withToken(state, "p2-token-1", 39); // green progress 39 -> ring 0
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "release-six", value: 6 }],
    }).state;
    const result = applyAction(rolled, {
      type: "release-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "release-six",
    });

    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "active", progress: 39 });
  });

  it("allows same-color tokens to share a square", () => {
    let state = withToken(startedMatch("classic"), "p1-token-1", 9);
    state = withToken(state, "p1-token-2", 10);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "share", value: 1 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["share"],
    });

    expect(
      result.state.tokens.filter((token) => token.progress === 10),
    ).toHaveLength(2);
  });
});

describe("Classic home and victory", () => {
  it("moves through the private home lane and requires exact 57", () => {
    let state = withToken(startedMatch("classic"), "p1-token-1", 51);
    let rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "lane-5", value: 5 }],
    }).state;
    state = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["lane-5"],
    }).state;
    expect(
      state.tokens.find((token) => token.id === "p1-token-1"),
    ).toMatchObject({ status: "active", progress: 56 });

    rolled = applyAction(
      { ...state, activePlayerIndex: 0 },
      {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [{ id: "overshoot-2", value: 2 }],
      },
    ).state;
    expect(getLegalActions(rolled)).not.toContainEqual(
      expect.objectContaining({ tokenId: "p1-token-1" }),
    );
  });

  it("marks exact progress 57 won and completes after all four tokens win", () => {
    let state = startedMatch("classic");
    for (const tokenId of ["p1-token-1", "p1-token-2", "p1-token-3"]) {
      state = withToken(state, tokenId, 57);
    }
    state = withToken(state, "p1-token-4", 56);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "winning-one", value: 1 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-4",
      dieIds: ["winning-one"],
    });

    expect(result.state).toMatchObject({
      status: "completed",
      winnerPlayerId: "p1",
      pendingRoll: null,
    });
    expect(result.events).toContainEqual({
      type: "match-completed",
      winnerPlayerId: "p1",
    });
  });
});
