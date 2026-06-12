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
