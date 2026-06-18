import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import {
  CLASSIC_SAFE_RING_INDEXES,
  WON_PROGRESS,
} from "@/lib/ludo/constants";
import {
  legalMovesByToken,
  rollActionFor,
  setupLocalMatch,
} from "@/lib/ludo-ui/local-game";

import {
  applyUsePower,
  isShielded,
  powersOf,
  resolveExtremeLanding,
} from "./extreme";

// Green opening is ring 13, so green progress 44 sits on ring index 5
// ((13 + 44) % 52 === 5), a non-safe square that also holds a power tile.
const GREEN_PROGRESS_ON_RING_5 = 44;

// Extreme now randomizes safe squares and power tiles per match, so pin a known
// layout (the classic safe squares + fixed tiles) for deterministic assertions.
function extremeMatch(): MatchState {
  const base = setupLocalMatch([{ name: "Red" }, { name: "Green" }], "extreme");
  return {
    ...base,
    powerUps: {
      ...base.powerUps!,
      safeRingIndexes: [...CLASSIC_SAFE_RING_INDEXES],
      tiles: [
        { ringIndex: 5, power: "shield" },
        { ringIndex: 18, power: "dash" },
        { ringIndex: 31, power: "shield" },
        { ringIndex: 44, power: "dash" },
      ],
    },
  };
}

describe("Extreme power tiles", () => {
  it("starts with power tiles and empty inventories", () => {
    const state = extremeMatch();
    expect(state.powerUps?.tiles.length).toBe(4);
    expect(powersOf(state, "p1")).toEqual([]);
  });

  it("collects a shield when landing on a power tile", () => {
    const state = extremeMatch();
    const landing = resolveExtremeLanding(state, "p1", 5);
    expect(landing.events.some((e) => e.type === "power-collected")).toBe(true);
    expect(landing.powerUps.inventory["p1"]).toEqual(["shield"]);
    expect(landing.powerUps.tiles.some((t) => t.ringIndex === 5)).toBe(false);
  });
});

describe("Extreme capture + shield", () => {
  function withGreenVictim(shielded: boolean): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p2-token-1"
          ? { ...t, status: "active" as const, progress: GREEN_PROGRESS_ON_RING_5 }
          : t,
      ),
      powerUps: {
        ...base.powerUps!,
        shieldedTokenIds: shielded ? ["p2-token-1"] : [],
      },
    };
  }

  it("captures an unshielded opponent on a non-safe square", () => {
    const landing = resolveExtremeLanding(withGreenVictim(false), "p1", 5);
    expect(landing.events.some((e) => e.type === "token-captured")).toBe(true);
    const victim = landing.tokens.find((t) => t.id === "p2-token-1");
    expect(victim?.status).toBe("yard");
  });

  it("blocks the capture and consumes the shield when the target is shielded", () => {
    const landing = resolveExtremeLanding(withGreenVictim(true), "p1", 5);
    expect(landing.events.some((e) => e.type === "capture-blocked")).toBe(true);
    expect(landing.events.some((e) => e.type === "token-captured")).toBe(false);
    const victim = landing.tokens.find((t) => t.id === "p2-token-1");
    expect(victim?.status).toBe("active");
    expect(landing.powerUps.shieldedTokenIds).not.toContain("p2-token-1");
  });
});

describe("use-power", () => {
  function readyToShield(): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1"
          ? { ...t, status: "active" as const, progress: 3 }
          : t,
      ),
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: ["shield"] },
      },
    };
  }

  it("shields one of your active tokens and spends the shield", () => {
    const state = readyToShield();
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "shield",
      tokenId: "p1-token-1",
    });
    expect(isShielded(next, "p1-token-1")).toBe(true);
    expect(powersOf(next, "p1")).toEqual([]);
    expect(events.some((e) => e.type === "power-used")).toBe(true);
  });

  it("rejects shielding without a shield in hand", () => {
    const base = readyToShield();
    const noShield: MatchState = {
      ...base,
      powerUps: { ...base.powerUps!, inventory: { p1: [] } },
    };
    expect(() =>
      applyUsePower(noShield, {
        type: "use-power",
        expectedVersion: noShield.version,
        playerId: "p1",
        power: "shield",
        tokenId: "p1-token-1",
      }),
    ).toThrow();
  });

  it("rejects shielding an opponent's token", () => {
    const state = readyToShield();
    expect(() =>
      applyUsePower(state, {
        type: "use-power",
        expectedVersion: state.version,
        playerId: "p1",
        power: "shield",
        tokenId: "p2-token-1",
      }),
    ).toThrow();
  });
});

describe("last stand boost", () => {
  // A lone surviving token only fights harder against a clearly-leading
  // opponent, so by default give the opponent two tokens already home.
  function withActiveCount(
    activeCount: 1 | 2,
    opponentLead = true,
  ): MatchState {
    const base = extremeMatch();
    const ids = ["p1-token-1", "p1-token-2"];
    const leaders = ["p2-token-1", "p2-token-2"];
    return {
      ...base,
      tokens: base.tokens.map((t) => {
        if (ids.slice(0, activeCount).includes(t.id)) {
          return { ...t, status: "active" as const, progress: 2 };
        }
        if (opponentLead && leaders.includes(t.id)) {
          return { ...t, status: "won" as const, progress: WON_PROGRESS };
        }
        return t;
      }),
    };
  }

  it("doubles a lone surviving token's move against a leading opponent", () => {
    const lone = withActiveCount(1);
    const rolled = applyAction(lone, rollActionFor(lone, [3])).state;
    const move = legalMovesByToken(rolled, getLegalActions(rolled)).get(
      "p1-token-1",
    )!;
    const next = applyAction(rolled, move).state;
    expect(next.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(8);
  });

  it("does not boost a lone token when no opponent has a big lead", () => {
    const lone = withActiveCount(1, false);
    const rolled = applyAction(lone, rollActionFor(lone, [3])).state;
    const move = legalMovesByToken(rolled, getLegalActions(rolled)).get(
      "p1-token-1",
    )!;
    const next = applyAction(rolled, move).state;
    expect(next.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(5);
  });

  it("does not boost when more than one piece is in play", () => {
    const pair = withActiveCount(2);
    const rolled = applyAction(pair, rollActionFor(pair, [3])).state;
    const move = legalMovesByToken(rolled, getLegalActions(rolled)).get(
      "p1-token-1",
    )!;
    const next = applyAction(rolled, move).state;
    expect(next.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(5);
  });
});

describe("strategy-book loadouts", () => {
  it("grants a power drawn from the player's loadout, not the tile's", () => {
    const base = extremeMatch();
    // The ring-5 tile is a shield, but p1's book only equips dash.
    const state: MatchState = {
      ...base,
      powerUps: { ...base.powerUps!, loadouts: { p1: ["dash"] } },
    };
    const landing = resolveExtremeLanding(state, "p1", 5);
    expect(landing.powerUps.inventory["p1"]).toEqual(["dash"]);
  });

  it("falls back to the tile's own power when no loadout is equipped", () => {
    const landing = resolveExtremeLanding(extremeMatch(), "p1", 5);
    expect(landing.powerUps.inventory["p1"]).toEqual(["shield"]);
  });
});

describe("warp power", () => {
  function readyToWarp(): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1"
          ? { ...t, status: "active" as const, progress: 2 }
          : t,
      ),
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: ["warp"] },
      },
    };
  }

  it("jumps a token forward to the next safe square", () => {
    const state = readyToWarp();
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "warp",
      tokenId: "p1-token-1",
    });
    // Red progress maps to ring index directly; 8 is the next safe square.
    expect(next.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(8);
    expect(events.some((e) => e.type === "token-warped")).toBe(true);
    expect(powersOf(next, "p1")).toEqual([]);
  });
});

describe("snipe power", () => {
  // Green progress 44 sits on ring index 5, a non-safe square.
  function readyToSnipe(targetProgress: number, shielded = false): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p2-token-1"
          ? { ...t, status: "active" as const, progress: targetProgress }
          : t,
      ),
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: ["snipe"] },
        shieldedTokenIds: shielded ? ["p2-token-1"] : [],
      },
    };
  }

  it("sends an opponent's token on a non-safe square back to the yard", () => {
    const state = readyToSnipe(GREEN_PROGRESS_ON_RING_5);
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "snipe",
      tokenId: "p1-token-1",
      targetTokenId: "p2-token-1",
    });
    const victim = next.tokens.find((t) => t.id === "p2-token-1");
    expect(victim?.status).toBe("yard");
    expect(events.some((e) => e.type === "token-captured")).toBe(true);
  });

  it("is absorbed by a shield rather than sending the token home", () => {
    const state = readyToSnipe(GREEN_PROGRESS_ON_RING_5, true);
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "snipe",
      tokenId: "p1-token-1",
      targetTokenId: "p2-token-1",
    });
    expect(next.tokens.find((t) => t.id === "p2-token-1")?.status).toBe(
      "active",
    );
    expect(isShielded(next, "p2-token-1")).toBe(false);
    expect(events.some((e) => e.type === "capture-blocked")).toBe(true);
  });

  it("rejects sniping a token on a safe square", () => {
    // Green progress 0 sits on its opening, a safe square.
    const state = readyToSnipe(0);
    expect(() =>
      applyAction(state, {
        type: "use-power",
        expectedVersion: state.version,
        playerId: "p1",
        power: "snipe",
        tokenId: "p1-token-1",
        targetTokenId: "p2-token-1",
      }),
    ).toThrow();
  });
});

describe("swap power", () => {
  it("exchanges the positions of your token and an opponent's", () => {
    const base = extremeMatch();
    const state: MatchState = {
      ...base,
      tokens: base.tokens.map((t) => {
        if (t.id === "p1-token-1")
          return { ...t, status: "active" as const, progress: 5 };
        if (t.id === "p2-token-1")
          return { ...t, status: "active" as const, progress: 40 };
        return t;
      }),
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: ["swap"] },
      },
    };
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "swap",
      tokenId: "p1-token-1",
      targetTokenId: "p2-token-1",
    });
    expect(next.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(40);
    expect(next.tokens.find((t) => t.id === "p2-token-1")?.progress).toBe(5);
    expect(events.some((e) => e.type === "tokens-swapped")).toBe(true);
  });
});

describe("power tile respawn", () => {
  it("refills the tiles at the start of a turn once the board is empty", () => {
    const base = extremeMatch();
    const empty: MatchState = {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1" ? { ...t, status: "active" as const, progress: 2 } : t,
      ),
      powerUps: { ...base.powerUps!, tiles: [] },
    };
    const { state: next, events } = applyAction(empty, rollActionFor(empty, [3]));
    expect(next.powerUps?.tiles.length).toBe(4);
    expect(events.some((e) => e.type === "power-tiles-refilled")).toBe(true);
  });

  it("does not refill while tiles remain", () => {
    const base = extremeMatch();
    const state: MatchState = {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1" ? { ...t, status: "active" as const, progress: 2 } : t,
      ),
    };
    const { events } = applyAction(state, rollActionFor(state, [3]));
    expect(events.some((e) => e.type === "power-tiles-refilled")).toBe(false);
  });
});

describe("dash power", () => {
  function withDash(progress: number, dashed: boolean): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1"
          ? { ...t, status: "active" as const, progress }
          : // A second active token keeps the player out of Last Stand so this
            // test isolates the dash boost.
            t.id === "p1-token-2"
            ? { ...t, status: "active" as const, progress: 1 }
            : t,
      ),
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: dashed ? ["dash"] : [] },
        dashTokenIds: dashed ? ["p1-token-1"] : [],
      },
    };
  }

  it("doubles the move and consumes the dash", () => {
    let state = withDash(2, true);
    // Strip the held dash now it's armed on the token.
    state = {
      ...state,
      powerUps: { ...state.powerUps!, inventory: { p1: [] } },
    };
    state = applyAction(state, rollActionFor(state, [3])).state;
    const move = legalMovesByToken(state, getLegalActions(state)).get(
      "p1-token-1",
    )!;
    const next = applyAction(state, move).state;
    const token = next.tokens.find((t) => t.id === "p1-token-1");
    expect(token?.progress).toBe(8); // 2 + 3 * 2
    expect(next.powerUps?.dashTokenIds).not.toContain("p1-token-1");
  });

  it("makes an otherwise-legal move illegal when it would overshoot home", () => {
    // At progress 50 a 6 normally reaches 56 (legal); doubled it overshoots 57.
    const dashed = applyAction(withDash(50, true), rollActionFor(withDash(50, true), [6])).state;
    expect(
      legalMovesByToken(dashed, getLegalActions(dashed)).has("p1-token-1"),
    ).toBe(false);

    const plain = applyAction(withDash(50, false), rollActionFor(withDash(50, false), [6])).state;
    expect(
      legalMovesByToken(plain, getLegalActions(plain)).has("p1-token-1"),
    ).toBe(true);
  });
});

describe("summon power", () => {
  function readyToSummon(): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: ["summon"] },
      },
    };
  }

  it("releases a yard token to its start without a six", () => {
    const state = readyToSummon();
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "summon",
      tokenId: "p1-token-1",
    });
    const token = next.tokens.find((t) => t.id === "p1-token-1");
    expect(token?.status).toBe("active");
    expect(token?.progress).toBe(0);
    expect(events.some((e) => e.type === "token-released")).toBe(true);
    expect(powersOf(next, "p1")).toEqual([]);
  });

  it("rejects summoning a token that is already on the board", () => {
    const base = readyToSummon();
    const state: MatchState = {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1"
          ? { ...t, status: "active" as const, progress: 4 }
          : t,
      ),
    };
    expect(() =>
      applyAction(state, {
        type: "use-power",
        expectedVersion: state.version,
        playerId: "p1",
        power: "summon",
        tokenId: "p1-token-1",
      }),
    ).toThrow();
  });
});

describe("bolt power", () => {
  function readyToBolt(targetProgress: number, shielded = false): MatchState {
    const base = extremeMatch();
    return {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p2-token-1"
          ? { ...t, status: "active" as const, progress: targetProgress }
          : t,
      ),
      powerUps: {
        ...base.powerUps!,
        inventory: { ...base.powerUps!.inventory, p1: ["bolt"] },
        shieldedTokenIds: shielded ? ["p2-token-1"] : [],
      },
    };
  }

  it("knocks an exposed enemy token back six squares", () => {
    const state = readyToBolt(GREEN_PROGRESS_ON_RING_5);
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "bolt",
      tokenId: "p2-token-1",
      targetTokenId: "p2-token-1",
    });
    const token = next.tokens.find((t) => t.id === "p2-token-1");
    expect(token?.status).toBe("active");
    expect(token?.progress).toBe(GREEN_PROGRESS_ON_RING_5 - 6);
    expect(events.some((e) => e.type === "token-warped")).toBe(true);
  });

  it("is absorbed by a shield", () => {
    const state = readyToBolt(GREEN_PROGRESS_ON_RING_5, true);
    const { state: next, events } = applyAction(state, {
      type: "use-power",
      expectedVersion: state.version,
      playerId: "p1",
      power: "bolt",
      tokenId: "p2-token-1",
      targetTokenId: "p2-token-1",
    });
    expect(next.tokens.find((t) => t.id === "p2-token-1")?.progress).toBe(
      GREEN_PROGRESS_ON_RING_5,
    );
    expect(isShielded(next, "p2-token-1")).toBe(false);
    expect(events.some((e) => e.type === "capture-blocked")).toBe(true);
  });
});
