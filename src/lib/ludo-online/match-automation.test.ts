import { describe, expect, it } from "vitest";

import { assertMatchInvariants } from "@/lib/ludo";

import { buildStartedMatch, resolveIntent, seatOwner } from "./authority";
import type { OnlineSeat } from "./authority";
import {
  forfeitUser,
  resolveTurnTimeout,
  setConnectionForUser,
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
      next.players.find((p) => seatOwner(p.id) === "user-a")
        ?.consecutiveTimeouts,
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
    expect(seatOwner(next.players[next.activePlayerIndex].id)).toBe("user-b");
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
        seatOwner(state.players[state.activePlayerIndex].id) !== "user-a" &&
        guard < 50
      ) {
        guard += 1;
        state = resolveTurnTimeout(state, { rng: () => 3 }).state;
      }
      if (
        state.status === "active" &&
        seatOwner(state.players[state.activePlayerIndex].id) === "user-a"
      ) {
        state = resolveTurnTimeout(state, { rng: () => 6 }).state;
      }
    }
    const ada = state.players.find((p) => seatOwner(p.id) === "user-a");
    expect(ada?.forfeited).toBe(true);
    assertMatchInvariants(state);
  });
});

describe("connection and forfeit wrappers", () => {
  it("marks all of a user's seats disconnected and reconnected", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const off = setConnectionForUser(state, "user-b", false).state;
    expect(
      off.players.find((p) => seatOwner(p.id) === "user-b")?.connected,
    ).toBe(false);
    const on = setConnectionForUser(off, "user-b", true).state;
    expect(
      on.players.find((p) => seatOwner(p.id) === "user-b")?.connected,
    ).toBe(true);
  });

  it("disconnects every seat a multi-seat user owns", () => {
    const seats: OnlineSeat[] = [
      { userId: "a", displayName: "A", seat: 1 },
      { userId: "solo", displayName: "Solo", seat: 2 },
      { userId: "solo", displayName: "Solo", seat: 3 },
    ];
    const state = buildStartedMatch("m", seats, "classic");
    const off = setConnectionForUser(state, "solo", false).state;
    const soloSeats = off.players.filter((p) => seatOwner(p.id) === "solo");
    expect(soloSeats).toHaveLength(2);
    expect(soloSeats.every((p) => !p.connected)).toBe(true);
  });

  it("forfeits a user", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const next = forfeitUser(state, "user-b").state;
    expect(
      next.players.find((p) => seatOwner(p.id) === "user-b")?.forfeited,
    ).toBe(true);
  });
});
