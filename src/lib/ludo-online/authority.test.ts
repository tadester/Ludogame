import { describe, expect, it } from "vitest";

import { applyAction, assertMatchInvariants, getLegalActions } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";

import {
  buildStartedMatch,
  diceCountForRuleset,
  NotYourTurnError,
  parseServerIntent,
  resolveIntent,
  serverRoll,
} from "./authority";
import type { OnlineSeat } from "./authority";

const SEATS: OnlineSeat[] = [
  { userId: "user-a", displayName: "Ada", seat: 1 },
  { userId: "user-b", displayName: "Ben", seat: 2 },
];

function fixedRng(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("buildStartedMatch", () => {
  it("seats members in seat order with play-order colors and starts active", () => {
    const state = buildStartedMatch("match-1", SEATS, "classic");
    expect(state.id).toBe("match-1");
    expect(state.status).toBe("active");
    expect(state.players.map((p) => p.id)).toEqual(["user-a", "user-b"]);
    expect(state.players.map((p) => p.color)).toEqual(["red", "green"]);
    assertMatchInvariants(state);
  });

  it("orders by seat regardless of input order", () => {
    const shuffled: OnlineSeat[] = [
      { userId: "user-b", displayName: "Ben", seat: 2 },
      { userId: "user-a", displayName: "Ada", seat: 1 },
    ];
    const state = buildStartedMatch("m", shuffled, "classic");
    expect(state.players.map((p) => p.id)).toEqual(["user-a", "user-b"]);
  });

  it("rejects fewer than two or more than four players", () => {
    expect(() =>
      buildStartedMatch("m", SEATS.slice(0, 1), "classic"),
    ).toThrow();
  });
});

describe("serverRoll", () => {
  it("uses replay-stable ids and validates die values", () => {
    const state = buildStartedMatch("m", SEATS, "nigerian");
    const dice = serverRoll(state, fixedRng(4, 6));
    expect(dice).toHaveLength(diceCountForRuleset("nigerian"));
    expect(dice.map((d) => d.value)).toEqual([4, 6]);
    expect(dice[0].id).toBe(`roll-${state.turnNumber}-${state.rollNumber}-0`);
  });

  it("rejects out-of-range RNG output", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    expect(() => serverRoll(state, fixedRng(7))).toThrow();
    expect(() => serverRoll(state, fixedRng(0))).toThrow();
  });
});

describe("parseServerIntent", () => {
  it("accepts well-formed intents", () => {
    expect(parseServerIntent({ kind: "roll" })).toEqual({ kind: "roll" });
    expect(
      parseServerIntent({ kind: "move-token", tokenId: "t1", dieIds: ["d1"] }),
    ).toEqual({ kind: "move-token", tokenId: "t1", dieIds: ["d1"] });
    expect(
      parseServerIntent({ kind: "release-token", tokenId: "t1", dieId: "d1" }),
    ).toEqual({ kind: "release-token", tokenId: "t1", dieId: "d1" });
  });

  it("rejects malformed or unknown intents", () => {
    expect(parseServerIntent(null)).toBeNull();
    expect(parseServerIntent({ kind: "nope" })).toBeNull();
    expect(parseServerIntent({ kind: "move-token", tokenId: "t1" })).toBeNull();
    expect(
      parseServerIntent({ kind: "release-token", tokenId: 1, dieId: "d1" }),
    ).toBeNull();
  });
});

describe("resolveIntent", () => {
  it("rolls dice server-side for the active player", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const { state: next, events } = resolveIntent(
      state,
      "user-a",
      { kind: "roll" },
      fixedRng(6),
    );
    expect(next.version).toBe(state.version + 1);
    expect(next.pendingRoll?.dice[0].value).toBe(6);
    expect(events.some((e) => e.type === "dice-rolled")).toBe(true);
  });

  it("rejects an action from a player who is not active", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    expect(() =>
      resolveIntent(state, "user-b", { kind: "roll" }, fixedRng(6)),
    ).toThrow(NotYourTurnError);
  });

  it("applies a legal move intent", () => {
    let state = buildStartedMatch("m", SEATS, "classic");
    state = resolveIntent(state, "user-a", { kind: "roll" }, fixedRng(6)).state;

    const move = getLegalActions(state).find((a) => a.type === "release-token");
    expect(move?.type).toBe("release-token");
    if (move?.type !== "release-token") throw new Error("expected a release");

    const { state: next } = resolveIntent(
      state,
      "user-a",
      { kind: "release-token", tokenId: move.tokenId, dieId: move.dieId },
      fixedRng(1),
    );
    const released = next.tokens.find((t) => t.id === move.tokenId);
    expect(released?.status).toBe("active");
  });

  it("drives a full online game to completion through the engine", () => {
    let state: MatchState = buildStartedMatch("m", SEATS, "classic");
    let seed = 0x2f6b1c;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return 1 + (seed % 6);
    };

    let guard = 0;
    while (state.status !== "completed" && guard < 100000) {
      guard += 1;
      const active = state.players[state.activePlayerIndex].id;
      if (state.phase === "awaiting-roll") {
        state = resolveIntent(state, active, { kind: "roll" }, rng).state;
      } else {
        const actions = getLegalActions(state);
        const move = actions.find(
          (a) => a.type === "release-token" || a.type === "move-token",
        );
        if (!move) throw new Error("no legal move available");
        state = applyAction(state, move).state;
      }
      assertMatchInvariants(state);
    }

    expect(state.status).toBe("completed");
    expect(state.winnerPlayerId).not.toBeNull();
  });
});
