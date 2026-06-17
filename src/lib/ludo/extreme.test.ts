import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { WON_PROGRESS } from "@/lib/ludo/constants";
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

function extremeMatch(): MatchState {
  return setupLocalMatch([{ name: "Red" }, { name: "Green" }], "extreme");
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
