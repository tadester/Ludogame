import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAction,
  assertMatchInvariants,
  getLegalActions,
} from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";

import {
  botActionFor,
  dieOrderOptions,
  isBotPlayerId,
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

  it("can seat bot players in pass-the-phone matches", () => {
    const state = setupLocalMatch([
      { name: "Tade" },
      { name: "", kind: "bot" },
      { name: "Guest" },
    ]);

    expect(state.players.map((p) => p.id)).toEqual(["p1", "bot2", "p3"]);
    expect(state.players.map((p) => p.displayName)).toEqual([
      "Tade",
      "Bot Green",
      "Guest",
    ]);
    expect(isBotPlayerId(state.players[1].id)).toBe(true);
  });

  it("chooses legal bot actions for roll and move phases", () => {
    let state = setupLocalMatch([{ name: "Ada" }, { name: "", kind: "bot" }]);
    state = { ...state, activePlayerIndex: 1 };

    const roll = botActionFor(state, [6]);
    expect(roll?.type).toBe("roll-dice");
    state = applyAction(state, roll!).state;

    const move = botActionFor(state);
    expect(move).not.toBeNull();
    expect(getLegalActions(state)).toContainEqual(move);
  });

  it("scores Extreme bot captures past the classic ring length", () => {
    const base = setupLocalMatch(
      [{ name: "Ada" }, { name: "", kind: "bot" }],
      "extreme",
    );
    const state: MatchState = {
      ...base,
      activePlayerIndex: 1,
      phase: "awaiting-move",
      // Pin the safe squares to the openings so the capture target (ring 86)
      // is never randomly safe — otherwise this test depends on the layout.
      powerUps: base.powerUps
        ? { ...base.powerUps, safeRingIndexes: [0, 25, 50, 75] }
        : base.powerUps,
      pendingRoll: {
        dice: [{ id: "d1", value: 1 }],
        remainingDieIds: ["d1"],
        selectedDieOrder: null,
        forcedTokenId: null,
        startedWithAllTokensInYard: false,
        bonusReason: null,
      },
      tokens: base.tokens.map((token) => {
        if (token.id === "bot2-token-1") {
          return { ...token, status: "active", progress: 60 };
        }
        if (token.id === "bot2-token-2") {
          return { ...token, status: "active", progress: 80 };
        }
        if (token.id === "p1-token-1") {
          return { ...token, status: "active", progress: 86 };
        }
        return token;
      }),
    };

    const move = botActionFor(state);
    expect(move).toMatchObject({
      type: "move-token",
      tokenId: "bot2-token-1",
    });
  });

  it("seeds every seat's strategy book in Extreme mode", () => {
    const state = setupLocalMatch(
      [{ name: "Ada" }, { name: "Ben" }],
      "extreme",
      ["dash", "snipe"],
    );
    expect(state.powerUps?.loadouts).toEqual({
      p1: ["dash", "snipe"],
      p2: ["dash", "snipe"],
    });
    assertMatchInvariants(state);
  });

  it("leaves loadouts unset when none is chosen", () => {
    const state = setupLocalMatch([{ name: "Ada" }, { name: "Ben" }], "extreme");
    expect(state.powerUps?.loadouts).toBeUndefined();
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
