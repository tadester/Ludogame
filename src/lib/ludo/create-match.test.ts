import { describe, expect, it } from "vitest";

import * as engine from "@/lib/ludo";
import { applyAction, createMatch, getLegalActions } from "@/lib/ludo";

describe("createMatch", () => {
  it("creates four stable yard tokens for the host", () => {
    const state = createMatch({
      id: "match-1",
      ruleset: "classic",
      maxPlayers: 2,
      host: { id: "p1", displayName: "Ada", color: "red" },
    });

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

  it("offers only unused colors and lets the host start a full lobby", () => {
    let state = createMatch({
      id: "match-2",
      ruleset: "nigerian",
      maxPlayers: 2,
      host: { id: "p1", displayName: "Ada", color: "red" },
    });

    expect(getLegalActions(state)).toContainEqual({
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "", displayName: "", color: "green" },
    });

    state = applyAction(state, {
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "p2", displayName: "Ben", color: "green" },
    }).state;
    const started = applyAction(state, {
      type: "start-match",
      expectedVersion: 1,
      playerId: "p1",
    });

    expect(started.state.status).toBe("active");
    expect(started.state.version).toBe(2);
    expect(started.events).toEqual([{ type: "match-started", playerId: "p1" }]);
  });

  it("rejects invalid lobby actions", () => {
    const state = createMatch({
      id: "match-3",
      ruleset: "classic",
      maxPlayers: 2,
      host: { id: "p1", displayName: "Ada", color: "red" },
    });

    expect(() =>
      applyAction(state, {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "", displayName: "Ben", color: "green" },
      }),
    ).toThrow("Player ID is required");
    expect(() =>
      applyAction(state, {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "p2", displayName: "", color: "green" },
      }),
    ).toThrow("Display name is required");
    expect(() =>
      applyAction(state, {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "p1", displayName: "Ada Again", color: "green" },
      }),
    ).toThrow("Player p1 already joined");
    expect(() =>
      applyAction(state, {
        type: "join-seat",
        expectedVersion: 0,
        player: { id: "p2", displayName: "Ben", color: "red" },
      }),
    ).toThrow("Color red is already occupied");
    expect(() =>
      applyAction(state, {
        type: "start-match",
        expectedVersion: 0,
        playerId: "p2",
      }),
    ).toThrow("Only the host can start the match");
    expect(() =>
      applyAction(state, {
        type: "start-match",
        expectedVersion: 0,
        playerId: "p1",
      }),
    ).toThrow("Match requires 2 players before starting");
  });
});

it("exports the supported rules-engine API", () => {
  expect(Object.keys(engine).sort()).toEqual([
    "CLASSIC_SAFE_RING_INDEXES",
    "LudoRuleError",
    "OPENING_RING_INDEX",
    "ULTIMATE_MAX",
    "ULTIMATE_META",
    "applyAction",
    "assertMatchInvariants",
    "chargeOf",
    "createMatch",
    "enumerateLegalTurnSequences",
    "equippedUltimate",
    "getLegalActions",
    "isUltimateReady",
    "progressToRingIndex",
    "replayMatch",
    "ultimateCost",
    "ultimateUsesLeft",
  ]);
});
