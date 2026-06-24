import { describe, expect, it } from "vitest";

import { applyAction } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

/** A red move that lands on ring index 7, where a green token waits. */
function captureScenario(state: MatchState) {
  let next = withToken(state, "p1-token-1", 4); // red 4 -> ring 7 after +3
  next = withToken(next, "p2-token-1", 46); // green 46 -> ring 7
  const rolled = applyAction(next, {
    type: "roll-dice",
    expectedVersion: next.version,
    playerId: "p1",
    dice: [{ id: "move-3", value: 3 }],
  }).state;
  return applyAction(rolled, {
    type: "move-token",
    expectedVersion: rolled.version,
    playerId: "p1",
    tokenId: "p1-token-1",
    dieIds: ["move-3"],
  });
}

describe("team-owned seats never capture each other", () => {
  it("captures an opponent's token by default (no teams)", () => {
    const result = captureScenario(startedMatch("classic"));
    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "yard", progress: null });
  });

  it("spares a token when both seats share a team", () => {
    const allied: MatchState = {
      ...startedMatch("classic"),
      teams: { p1: "owner", p2: "owner" },
    };
    const result = captureScenario(allied);
    expect(
      result.state.tokens.find((token) => token.id === "p2-token-1"),
    ).toMatchObject({ status: "active", progress: 46 });
    expect(
      result.events.filter((event) => event.type === "token-captured"),
    ).toHaveLength(0);
  });
});
