import { describe, expect, it } from "vitest";

import { applyAction, enumerateLegalTurnSequences } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("enumerateLegalTurnSequences", () => {
  it("enumerates every Classic release choice in stable token order", () => {
    const state = startedMatch("classic");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "six", value: 6 }],
    }).state;
    const sequences = enumerateLegalTurnSequences(rolled);

    expect(sequences.map((sequence) => sequence.actions[0])).toEqual(
      ["p1-token-1", "p1-token-2", "p1-token-3", "p1-token-4"].map(
        (tokenId) => ({
          type: "release-token",
          expectedVersion: rolled.version,
          playerId: "p1",
          tokenId,
          dieId: "six",
        }),
      ),
    );
  });

  it("enumerates Nigerian die orders and token assignments to terminal roll states", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p1-token-2", 20);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "two", value: 2 },
        { id: "three", value: 3 },
      ],
    }).state;
    const sequences = enumerateLegalTurnSequences(rolled);

    expect(sequences).toHaveLength(8);
    expect(
      sequences.every(
        (sequence) =>
          sequence.state.pendingRoll === null &&
          sequence.state.phase === "awaiting-roll",
      ),
    ).toBe(true);
  });

  it("does not mutate the starting state", () => {
    const state = startedMatch("classic");
    const snapshot = structuredClone(state);
    enumerateLegalTurnSequences(state);
    expect(state).toEqual(snapshot);
  });
});
