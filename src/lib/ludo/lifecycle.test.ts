import { describe, expect, it } from "vitest";

import { applyAction, enumerateLegalTurnSequences } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("match lifecycle actions", () => {
  it("rejects stale versions without mutating state", () => {
    const state = startedMatch("classic");
    const snapshot = structuredClone(state);
    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version - 1,
        playerId: "p1",
        dice: [{ id: "one", value: 1 }],
      }),
    ).toThrow("Expected version");
    expect(state).toEqual(snapshot);
  });

  it("records disconnect and reconnect events without changing the turn", () => {
    const state = startedMatch("classic");
    const disconnected = applyAction(state, {
      type: "set-connection",
      expectedVersion: state.version,
      playerId: "p2",
      connected: false,
    });
    const reconnected = applyAction(disconnected.state, {
      type: "set-connection",
      expectedVersion: disconnected.state.version,
      playerId: "p2",
      connected: true,
    });
    expect(reconnected.state.activePlayerIndex).toBe(0);
    expect(reconnected.events).toEqual([
      { type: "connection-changed", playerId: "p2", connected: true },
    ]);
  });

  it("removes a forfeited player's active tokens and continues with remaining players", () => {
    const state = startedMatch("classic");
    const result = applyAction(state, {
      type: "forfeit-player",
      expectedVersion: state.version,
      playerId: "p1",
    });
    expect(result.state.players[0].forfeited).toBe(true);
    expect(
      result.state.tokens.filter((token) => token.playerId === "p1"),
    ).toEqual([]);
    expect(result.state.players[result.state.activePlayerIndex].id).toBe("p2");
  });

  it("resets consecutive timeouts after a completed non-timeout turn", () => {
    const base = withToken(startedMatch("classic"), "p1-token-1", 10);
    const state = {
      ...base,
      players: base.players.map((player) =>
        player.id === "p1" ? { ...player, consecutiveTimeouts: 2 } : player,
      ),
    };
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "normal-turn", value: 2 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["normal-turn"],
    });

    expect(
      result.state.players.find((player) => player.id === "p1"),
    ).toMatchObject({ consecutiveTimeouts: 0 });
  });

  it("accepts only a complete enumerated timeout sequence", () => {
    const state = withToken(startedMatch("classic"), "p1-token-1", 10);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "timeout-three", value: 3 }],
    }).state;
    const sequence = enumerateLegalTurnSequences(rolled)[0].actions;
    const result = applyAction(rolled, {
      type: "resolve-timeout",
      expectedVersion: rolled.version,
      playerId: "p1",
      sequence,
    });

    expect(result.events).toContainEqual({
      type: "turn-timed-out",
      playerId: "p1",
      consecutiveTimeouts: 1,
    });
    expect(result.state.players[0].consecutiveTimeouts).toBe(1);
  });

  it("rejects a partial timeout sequence", () => {
    const state = startedMatch("classic");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "timeout-six", value: 6 }],
    }).state;

    expect(() =>
      applyAction(rolled, {
        type: "resolve-timeout",
        expectedVersion: rolled.version,
        playerId: "p1",
        sequence: [],
      }),
    ).toThrow("Timeout sequence is not a complete legal turn");
  });

  it("forfeits on the third consecutive timeout", () => {
    const base = withToken(startedMatch("classic"), "p1-token-1", 10);
    const state = {
      ...base,
      players: base.players.map((player) =>
        player.id === "p1" ? { ...player, consecutiveTimeouts: 2 } : player,
      ),
    };
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "third-timeout", value: 2 }],
    }).state;
    const sequence = enumerateLegalTurnSequences(rolled)[0].actions;
    const result = applyAction(rolled, {
      type: "resolve-timeout",
      expectedVersion: rolled.version,
      playerId: "p1",
      sequence,
    });

    expect(
      result.state.players.find((player) => player.id === "p1")?.forfeited,
    ).toBe(true);
    expect(result.state.tokens.some((token) => token.playerId === "p1")).toBe(
      false,
    );
  });
});
