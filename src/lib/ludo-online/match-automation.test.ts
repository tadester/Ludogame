import { describe, expect, it } from "vitest";

import { assertMatchInvariants } from "@/lib/ludo";

import { buildStartedMatch, resolveIntent } from "./authority";
import type { OnlineSeat } from "./authority";
import {
  forfeitPlayer,
  resolveTurnTimeout,
  setConnection,
} from "./match-automation";

const SEATS: OnlineSeat[] = [
  { userId: "user-a", displayName: "Ada", seat: 1 },
  { userId: "user-b", displayName: "Ben", seat: 2 },
];

describe("resolveTurnTimeout", () => {
  it("rolls and plays a complete turn when the player has not rolled", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const { state: next, events } = resolveTurnTimeout(state, {
      rng: () => 6, // a six releases a token, so a move exists to resolve
    });
    expect(events.some((e) => e.type === "dice-rolled")).toBe(true);
    expect(events.some((e) => e.type === "turn-timed-out")).toBe(true);
    expect(
      next.players.find((p) => p.id === "user-a")?.consecutiveTimeouts,
    ).toBe(1);
    assertMatchInvariants(next);
  });

  it("resolves moves when the player already rolled but did not move", () => {
    let state = buildStartedMatch("m", SEATS, "classic");
    state = resolveIntent(state, "user-a", { kind: "roll" }, () => 6).state;
    expect(state.phase).toBe("awaiting-move");

    const { state: next, events } = resolveTurnTimeout(state, {
      rng: () => 6,
    });
    expect(events.some((e) => e.type === "turn-timed-out")).toBe(true);
    assertMatchInvariants(next);
  });

  it("ends the turn gracefully when an auto-roll yields no move", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const { state: next, events } = resolveTurnTimeout(state, {
      rng: () => 3, // no six, all tokens in yard -> turn advances, no move
    });
    expect(events.some((e) => e.type === "turn-advanced")).toBe(true);
    expect(next.players[next.activePlayerIndex].id).toBe("user-b");
    assertMatchInvariants(next);
  });

  it("forfeits after three consecutive timeouts", () => {
    let state = buildStartedMatch("m", SEATS, "classic");
    // Force user-a to time out three turns in a row by always rolling a six
    // (a playable roll) and timing out the move each time.
    for (let i = 0; i < 3 && state.status === "active"; i += 1) {
      // advance until it is user-a's turn at awaiting-roll
      let guard = 0;
      while (
        state.status === "active" &&
        state.players[state.activePlayerIndex].id !== "user-a" &&
        guard < 50
      ) {
        guard += 1;
        state = resolveTurnTimeout(state, { rng: () => 3 }).state;
      }
      if (
        state.status === "active" &&
        state.players[state.activePlayerIndex].id === "user-a"
      ) {
        state = resolveTurnTimeout(state, { rng: () => 6 }).state;
      }
    }
    const ada = state.players.find((p) => p.id === "user-a");
    expect(ada?.forfeited).toBe(true);
    assertMatchInvariants(state);
  });
});

describe("connection and forfeit wrappers", () => {
  it("marks a player disconnected and reconnected", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const off = setConnection(state, "user-b", false).state;
    expect(off.players.find((p) => p.id === "user-b")?.connected).toBe(false);
    const on = setConnection(off, "user-b", true).state;
    expect(on.players.find((p) => p.id === "user-b")?.connected).toBe(true);
  });

  it("forfeits a player", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const next = forfeitPlayer(state, "user-b").state;
    expect(next.players.find((p) => p.id === "user-b")?.forfeited).toBe(true);
  });
});
