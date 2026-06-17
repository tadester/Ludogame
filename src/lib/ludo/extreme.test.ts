import { describe, expect, it } from "vitest";

import { applyAction } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

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
