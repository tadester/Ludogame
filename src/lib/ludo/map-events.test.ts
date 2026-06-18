import { describe, expect, it } from "vitest";

import {
  CLASSIC_SAFE_RING_INDEXES,
  EARTHQUAKE_SETBACK,
  MAP_EVENT_INTERVAL,
} from "./constants";
import { applyMapEvent, mapEventDueAt } from "./map-events";
import type { MatchState } from "./types";
import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

// Pin the safe squares so ring 8 is safe and ring 5 is exposed for assertions.
function extremeAtTurn(turnNumber: number): MatchState {
  const base = setupLocalMatch([{ name: "Red" }, { name: "Green" }], "extreme");
  return {
    ...base,
    turnNumber,
    powerUps: {
      ...base.powerUps!,
      safeRingIndexes: [...CLASSIC_SAFE_RING_INDEXES],
    },
  };
}

describe("map event scheduling", () => {
  it("fires on each interval boundary and rotates events", () => {
    expect(mapEventDueAt(0)).toBeNull();
    expect(mapEventDueAt(MAP_EVENT_INTERVAL - 1)).toBeNull();
    expect(mapEventDueAt(MAP_EVENT_INTERVAL)).toBe("earthquake");
    expect(mapEventDueAt(MAP_EVENT_INTERVAL * 2)).toBe("power-surge");
    expect(mapEventDueAt(MAP_EVENT_INTERVAL * 3)).toBe("earthquake");
  });

  it("never fires outside Extreme mode", () => {
    const classic = setupLocalMatch([{ name: "A" }, { name: "B" }], "classic");
    expect(
      applyMapEvent({ ...classic, turnNumber: MAP_EVENT_INTERVAL }),
    ).toBeNull();
  });
});

describe("earthquake", () => {
  it("slides exposed tokens back but spares safe and lane tokens", () => {
    const base = extremeAtTurn(MAP_EVENT_INTERVAL);
    // Red ring index equals progress: 5 is exposed, 8 is a safe square.
    const state: MatchState = {
      ...base,
      tokens: base.tokens.map((t) => {
        if (t.id === "p1-token-1")
          return { ...t, status: "active" as const, progress: 5 };
        if (t.id === "p1-token-2")
          return { ...t, status: "active" as const, progress: 8 };
        return t;
      }),
    };
    const result = applyMapEvent(state)!;
    expect(result.event).toMatchObject({ type: "map-event", event: "earthquake" });
    expect(result.state.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(
      5 - EARTHQUAKE_SETBACK,
    );
    expect(result.state.tokens.find((t) => t.id === "p1-token-2")?.progress).toBe(
      8,
    );
  });

  it("never pushes a token below its start", () => {
    const base = extremeAtTurn(MAP_EVENT_INTERVAL);
    const state: MatchState = {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1"
          ? { ...t, status: "active" as const, progress: 2 }
          : t,
      ),
    };
    const result = applyMapEvent(state)!;
    expect(result.state.tokens.find((t) => t.id === "p1-token-1")?.progress).toBe(
      0,
    );
  });
});

describe("power surge", () => {
  it("banks one power for every player", () => {
    const state = extremeAtTurn(MAP_EVENT_INTERVAL * 2);
    const result = applyMapEvent(state)!;
    expect(result.event).toMatchObject({ event: "power-surge" });
    expect(result.state.powerUps?.inventory["p1"]).toHaveLength(1);
    expect(result.state.powerUps?.inventory["p2"]).toHaveLength(1);
  });

  it("draws surge powers from a player's loadout when equipped", () => {
    const base = extremeAtTurn(MAP_EVENT_INTERVAL * 2);
    const state: MatchState = {
      ...base,
      powerUps: { ...base.powerUps!, loadouts: { p1: ["snipe"], p2: ["warp"] } },
    };
    const result = applyMapEvent(state)!;
    expect(result.state.powerUps?.inventory["p1"]).toEqual(["snipe"]);
    expect(result.state.powerUps?.inventory["p2"]).toEqual(["warp"]);
  });
});
