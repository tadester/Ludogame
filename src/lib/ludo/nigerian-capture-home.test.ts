import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

function rollAndOrder(
  state: ReturnType<typeof startedMatch>,
  dice: [
    { id: string; value: 1 | 2 | 3 | 4 | 5 | 6 },
    { id: string; value: 1 | 2 | 3 | 4 | 5 | 6 },
  ],
) {
  const rolled = applyAction(state, {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId: "p1",
    dice,
  }).state;
  return applyAction(rolled, {
    type: "select-die-order",
    expectedVersion: rolled.version,
    playerId: "p1",
    dieIds: dice.map((die) => die.id),
  }).state;
}

describe("Nigerian captures", () => {
  it("captures one token from an opposing stack and immediately wins the capturer", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 5);
    state = withToken(state, "p1-token-2", 30);
    state = withToken(state, "p2-token-1", 46); // green 46 -> ring 7
    state = withToken(state, "p2-token-2", 46);
    const ordered = rollAndOrder(state, [
      { id: "two", value: 2 },
      { id: "one", value: 1 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["two"],
    });

    expect(
      result.state.tokens.find((token) => token.id === "p1-token-1"),
    ).toMatchObject({ status: "won", progress: 57 });
    expect(
      result.state.tokens.filter(
        (token) =>
          ["p2-token-1", "p2-token-2"].includes(token.id) &&
          token.status === "yard",
      ),
    ).toHaveLength(1);
    expect(result.events).toContainEqual({
      type: "token-won",
      playerId: "p1",
      tokenId: "p1-token-1",
      reason: "capture",
    });
    expect(getLegalActions(result.state)).not.toContainEqual(
      expect.objectContaining({ tokenId: "p1-token-1" }),
    );
  });

  it("requires a remaining die on another token after the capturer becomes won", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 5);
    state = withToken(state, "p1-token-2", 20);
    state = withToken(state, "p2-token-1", 46);
    const ordered = rollAndOrder(state, [
      { id: "two", value: 2 },
      { id: "three", value: 3 },
    ]);
    const captured = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["two"],
    }).state;

    expect(getLegalActions(captured)).toEqual([
      {
        type: "move-token",
        expectedVersion: captured.version,
        playerId: "p1",
        tokenId: "p1-token-2",
        dieIds: ["three"],
      },
    ]);
  });
});

describe("Nigerian opening protection", () => {
  it("has no general safe spaces", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 7);
    state = withToken(state, "p1-token-2", 30);
    state = withToken(state, "p2-token-1", 47); // green 47 -> Classic-safe ring 8
    const ordered = rollAndOrder(state, [
      { id: "one", value: 1 },
      { id: "two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["one"],
    });

    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "yard", progress: null });
  });

  it("lets an opponent stop on another color's occupied opening without capture", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 12);
    state = withToken(state, "p1-token-2", 30);
    state = withToken(state, "p2-token-1", 0); // green opening ring 13
    const ordered = rollAndOrder(state, [
      { id: "one", value: 1 },
      { id: "two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["one"],
    });

    expect(
      result.state.tokens.find((token) => token.id === "p1-token-1")?.progress,
    ).toBe(13);
    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "active", progress: 0 });
  });

  it("release-captures an opponent on the releasing color's opening and wins", () => {
    let state = startedMatch("nigerian");
    state = withToken(state, "p2-token-1", 39); // green progress 39 -> red opening 0
    const ordered = rollAndOrder(state, [
      { id: "six", value: 6 },
      { id: "two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "release-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "six",
    });

    expect(
      result.state.tokens.find((token) => token.id === "p1-token-1"),
    ).toMatchObject({ status: "won", progress: 57 });
    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "yard", progress: null });
  });
});
