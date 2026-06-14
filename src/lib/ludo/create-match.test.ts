import { describe, expect, it } from "vitest";

import {
  applyAction,
  createMatch,
  getLegalActions,
  LudoRuleError,
} from "@/lib/ludo";

function lobby() {
  return createMatch({
    id: "match-1",
    ruleset: "classic",
    maxPlayers: 2,
    host: { id: "p1", displayName: "Ada", color: "red" },
  });
}

describe("createMatch", () => {
  it("creates four stable yard tokens for the host", () => {
    const state = lobby();

    expect(state).toMatchObject({
      id: "match-1",
      status: "lobby",
      version: 0,
      hostPlayerId: "p1",
      activePlayerIndex: 0,
      turnNumber: 0,
      rollNumber: 0,
      phase: "awaiting-roll",
      pendingRoll: null,
      winnerPlayerId: null,
    });
    expect(state.tokens.map((token) => token.id)).toEqual([
      "p1-token-1",
      "p1-token-2",
      "p1-token-3",
      "p1-token-4",
    ]);
    expect(state.tokens.every((token) => token.status === "yard")).toBe(true);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("offers unused colors in deterministic order", () => {
    expect(getLegalActions(lobby())).toEqual([
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "", displayName: "", color: "blue" },
      },
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "", displayName: "", color: "green" },
      },
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "", displayName: "", color: "yellow" },
      },
    ]);
  });

  it("joins a seat without mutating the previous state", () => {
    const initial = lobby();
    const result = applyAction(initial, {
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "p2", displayName: "Ben", color: "green" },
    });

    expect(initial.players).toHaveLength(1);
    expect(initial.tokens).toHaveLength(4);
    expect(result.state.version).toBe(1);
    expect(result.state.players).toHaveLength(2);
    expect(result.state.tokens.slice(4).map((token) => token.id)).toEqual([
      "p2-token-1",
      "p2-token-2",
      "p2-token-3",
      "p2-token-4",
    ]);
    expect(result.events).toEqual([
      { type: "player-joined", playerId: "p2", color: "green" },
    ]);
  });

  it("lets only the host start a full lobby", () => {
    const joined = applyAction(lobby(), {
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "p2", displayName: "Ben", color: "green" },
    }).state;

    expect(getLegalActions(joined)).toEqual([
      { type: "start-match", expectedVersion: 1, playerId: "p1" },
    ]);

    const started = applyAction(joined, {
      type: "start-match",
      expectedVersion: 1,
      playerId: "p1",
    });

    expect(started.state).toMatchObject({
      status: "active",
      version: 2,
      activePlayerIndex: 0,
      turnNumber: 1,
      phase: "awaiting-roll",
    });
    expect(started.events).toEqual([
      { type: "match-started", playerId: "p1" },
    ]);
  });

  it.each([
    [
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "", displayName: "Ben", color: "green" },
      } as const,
      "Player ID is required",
    ],
    [
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "p2", displayName: " ", color: "green" },
      } as const,
      "Display name is required",
    ],
    [
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "p1", displayName: "Ada Again", color: "green" },
      } as const,
      "Player p1 already joined",
    ],
    [
      {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "p2", displayName: "Ben", color: "red" },
      } as const,
      "Color red is already occupied",
    ],
  ])("rejects an invalid join with %s", (action, message) => {
    expect(() => applyAction(lobby(), action)).toThrow(
      new LudoRuleError("INVALID_ACTION", message),
    );
  });

  it("rejects stale actions", () => {
    expect(() =>
      applyAction(lobby(), {
        type: "join-seat",
        expectedVersion: 9,
        player: { id: "p2", displayName: "Ben", color: "green" },
      }),
    ).toThrow(
      new LudoRuleError(
        "STALE_VERSION",
        "Expected version 0 but received 9",
      ),
    );
  });

  it("rejects starting before the lobby is full", () => {
    expect(() =>
      applyAction(lobby(), {
        type: "start-match",
        expectedVersion: 0,
        playerId: "p1",
      }),
    ).toThrow(
      new LudoRuleError(
        "INVALID_ACTION",
        "Match requires 2 players before starting",
      ),
    );
  });

  it("rejects a non-host starting the match", () => {
    const joined = applyAction(lobby(), {
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "p2", displayName: "Ben", color: "green" },
    }).state;

    expect(() =>
      applyAction(joined, {
        type: "start-match",
        expectedVersion: 1,
        playerId: "p2",
      }),
    ).toThrow(
      new LudoRuleError(
        "INVALID_ACTION",
        "Only the host can start the match",
      ),
    );
  });
});
