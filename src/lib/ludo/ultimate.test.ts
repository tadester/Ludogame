import { describe, expect, it } from "vitest";

import { applyAction } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

import { ULTIMATE_META } from "./ultimate";

function extreme(ultimate: "meteor" | "quake" | "surge"): MatchState {
  return setupLocalMatch([{ name: "Red" }, { name: "Green" }], "extreme", [], ultimate);
}

/** Force p1's meter to full and place tokens for the scenario. */
function charged(
  ultimate: "meteor" | "quake" | "surge",
  tokens: Partial<Record<string, { status: "active" | "yard"; progress: number | null }>>,
): MatchState {
  const base = extreme(ultimate);
  return {
    ...base,
    tokens: base.tokens.map((t) =>
      tokens[t.id]
        ? { ...t, status: tokens[t.id]!.status, progress: tokens[t.id]!.progress }
        : t,
    ),
    powerUps: {
      ...base.powerUps!,
      ultimate: { ...base.powerUps!.ultimate, p1: ULTIMATE_META[ultimate].cost },
    },
  };
}

describe("ultimate charging", () => {
  it("charges the incoming player each turn", () => {
    const base = extreme("surge");
    // p1 has a lone yard-released token so a no-move roll passes the turn.
    const seeded: MatchState = {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p1-token-1"
          ? { ...t, status: "active" as const, progress: 3 }
          : t,
      ),
    };
    const before = seeded.powerUps?.ultimate?.p2 ?? 0;
    // p1 rolls a 2 (no six, single token can't be released, moves its token);
    // then turn passes to p2 who gains charge. Simulate p2 receiving a turn by
    // rolling p1 a value that ends their turn.
    const rolled = applyAction(seeded, {
      type: "roll-dice",
      expectedVersion: seeded.version,
      playerId: "p1",
      dice: [{ id: "d", value: 2 }],
    }).state;
    // p1 moved; turn ends (no six) -> p2 becomes active and charged.
    const moved = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["d"],
    }).state;
    expect((moved.powerUps?.ultimate?.p2 ?? 0)).toBeGreaterThan(before);
  });
});

describe("meteor ultimate", () => {
  it("sends a targeted enemy token home from any range", () => {
    const state = charged("meteor", {
      "p2-token-1": { status: "active", progress: 30 },
    });
    const { state: next, events } = applyAction(state, {
      type: "use-ultimate",
      expectedVersion: state.version,
      playerId: "p1",
      ultimate: "meteor",
      targetTokenId: "p2-token-1",
    });
    expect(next.tokens.find((t) => t.id === "p2-token-1")?.status).toBe("yard");
    expect(events.some((e) => e.type === "ultimate-used")).toBe(true);
    // The meter drains and a use is counted.
    expect(next.powerUps?.ultimate?.p1).toBe(0);
    expect(next.powerUps?.ultimateUses?.p1).toBe(1);
  });

  it("rejects casting an ultimate you do not have equipped", () => {
    const state = charged("meteor", {
      "p2-token-1": { status: "active", progress: 30 },
    });
    expect(() =>
      applyAction(state, {
        type: "use-ultimate",
        expectedVersion: state.version,
        playerId: "p1",
        ultimate: "quake",
      }),
    ).toThrow();
  });

  it("rejects casting before fully charged", () => {
    const base = extreme("meteor");
    const state: MatchState = {
      ...base,
      tokens: base.tokens.map((t) =>
        t.id === "p2-token-1"
          ? { ...t, status: "active" as const, progress: 30 }
          : t,
      ),
      powerUps: { ...base.powerUps!, ultimate: { p1: 10 } },
    };
    expect(() =>
      applyAction(state, {
        type: "use-ultimate",
        expectedVersion: state.version,
        playerId: "p1",
        ultimate: "meteor",
        targetTokenId: "p2-token-1",
      }),
    ).toThrow();
  });
});

describe("quake ultimate", () => {
  it("knocks every exposed enemy ring token back", () => {
    const state = charged("quake", {
      "p2-token-1": { status: "active", progress: 30 },
      "p2-token-2": { status: "active", progress: 4 },
    });
    const { state: next } = applyAction(state, {
      type: "use-ultimate",
      expectedVersion: state.version,
      playerId: "p1",
      ultimate: "quake",
    });
    expect(next.tokens.find((t) => t.id === "p2-token-1")?.progress).toBe(22);
    expect(next.tokens.find((t) => t.id === "p2-token-2")?.progress).toBe(0);
  });
});

describe("surge ultimate", () => {
  it("shields all your active tokens and is reusable", () => {
    const state = charged("surge", {
      "p1-token-1": { status: "active", progress: 5 },
      "p1-token-2": { status: "active", progress: 9 },
    });
    const { state: next } = applyAction(state, {
      type: "use-ultimate",
      expectedVersion: state.version,
      playerId: "p1",
      ultimate: "surge",
    });
    expect(next.powerUps?.shieldedTokenIds).toContain("p1-token-1");
    expect(next.powerUps?.shieldedTokenIds).toContain("p1-token-2");
    // Surge is uncapped, so uses left stays positive.
    expect(ULTIMATE_META.surge.maxUses).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("ultimate use caps", () => {
  it("blocks a meteor once its uses are spent", () => {
    const base = charged("meteor", {
      "p2-token-1": { status: "active", progress: 30 },
    });
    const state: MatchState = {
      ...base,
      powerUps: {
        ...base.powerUps!,
        ultimateUses: { p1: ULTIMATE_META.meteor.maxUses },
      },
    };
    expect(() =>
      applyAction(state, {
        type: "use-ultimate",
        expectedVersion: state.version,
        playerId: "p1",
        ultimate: "meteor",
        targetTokenId: "p2-token-1",
      }),
    ).toThrow();
  });
});
