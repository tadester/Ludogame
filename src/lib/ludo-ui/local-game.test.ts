import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAction,
  assertMatchInvariants,
  getLegalActions,
} from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";

import {
  dieOrderOptions,
  legalMovesByToken,
  rollDie,
  rollAction,
  rollActionFor,
  setupLocalMatch,
} from "./local-game";

afterEach(() => {
  vi.restoreAllMocks();
});

function progressOfMove(
  state: MatchState,
  action: ReturnType<typeof legalMovesByToken> extends Map<string, infer A>
    ? A
    : never,
): number {
  if (action.type === "release-token") return 0;
  if (action.type === "move-token") {
    const token = state.tokens.find((t) => t.id === action.tokenId);
    return (token?.progress ?? 0) + 1;
  }
  return -1;
}

describe("local-game helpers", () => {
  it("rolls local dice with browser crypto instead of Math.random", () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not drive dice rolls");
    });
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint32Array) {
          array[0] = 0;
        }
        return array;
      },
    );

    expect(rollDie()).toBe(1);
  });

  it("seats players in play order and starts the match", () => {
    const state = setupLocalMatch([{ name: "Ada" }, { name: "Ben" }]);
    expect(state.status).toBe("active");
    expect(state.players.map((p) => p.color)).toEqual(["red", "green"]);
    expect(state.players.map((p) => p.displayName)).toEqual(["Ada", "Ben"]);
    expect(state.tokens).toHaveLength(8);
  });

  it("falls back to color names and supports four players", () => {
    const state = setupLocalMatch([
      { name: "" },
      { name: "" },
      { name: "" },
      { name: "" },
    ]);
    expect(state.players.map((p) => p.displayName)).toEqual([
      "Red",
      "Green",
      "Yellow",
      "Blue",
    ]);
  });

  it("builds a roll action the engine accepts", () => {
    const state = setupLocalMatch([{ name: "Ada" }, { name: "Ben" }]);
    const result = applyAction(state, rollAction(state, 6));
    expect(result.state.pendingRoll?.dice[0].value).toBe(6);
    const moves = legalMovesByToken(result.state, getLegalActions(result.state));
    expect([...moves.keys()].sort()).toEqual([
      "p1-token-1",
      "p1-token-2",
      "p1-token-3",
      "p1-token-4",
    ]);
  });

  it("plays a full legal game to a winner through the UI action path", () => {
    let state = setupLocalMatch([{ name: "Ada" }, { name: "Ben" }]);
    let seed = 0x1a2b3c4d;
    const nextDie = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return 1 + (seed % 6);
    };

    let guard = 0;
    while (state.status !== "completed" && guard < 100000) {
      guard += 1;
      if (state.phase === "awaiting-roll") {
        state = applyAction(state, rollAction(state, nextDie())).state;
      } else {
        const moves = [
          ...legalMovesByToken(state, getLegalActions(state)).values(),
        ];
        // Greedily advance the furthest token so the game finishes promptly.
        const best = moves.reduce((a, b) =>
          progressOfMove(state, b) > progressOfMove(state, a) ? b : a,
        );
        state = applyAction(state, best).state;
      }
      assertMatchInvariants(state);
    }

    expect(state.status).toBe("completed");
    expect(state.winnerPlayerId).not.toBeNull();
    const champion = state.tokens.filter(
      (t) => t.playerId === state.winnerPlayerId && t.status === "won",
    );
    expect(champion).toHaveLength(4);
  });

  it("plays a full Nigerian game through the UI action path", () => {
    let state = setupLocalMatch([{ name: "Ada" }, { name: "Ben" }], "nigerian");
    expect(state.ruleset).toBe("nigerian");
    let seed = 0x51ed5;
    const nextDie = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return 1 + (seed % 6);
    };

    let guard = 0;
    while (state.status !== "completed" && guard < 200000) {
      guard += 1;
      if (state.phase === "awaiting-roll") {
        state = applyAction(
          state,
          rollActionFor(state, [nextDie(), nextDie()]),
        ).state;
      } else if (state.phase === "awaiting-die-order") {
        const [first] = dieOrderOptions(getLegalActions(state));
        state = applyAction(state, first.action).state;
      } else {
        const moves = [
          ...legalMovesByToken(state, getLegalActions(state)).values(),
        ];
        const best = moves.reduce((a, b) =>
          progressOfMove(state, b) > progressOfMove(state, a) ? b : a,
        );
        state = applyAction(state, best).state;
      }
      assertMatchInvariants(state);
    }

    expect(state.status).toBe("completed");
    expect(state.winnerPlayerId).not.toBeNull();
  });
});
