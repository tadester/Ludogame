import { describe, expect, it } from "vitest";

import {
  CLASSIC_SAFE_RING_INDEXES,
  OPENING_RING_INDEX,
  progressToRingIndex,
} from "@/lib/ludo";
import type {
  ApplyActionResult,
  MatchAction,
  MatchState,
  PlayableTurnAction,
  ReplayEntry,
  TurnSequence,
} from "@/lib/ludo";

describe("Ludo board topology", () => {
  it("uses the approved opening and Classic safe indexes", () => {
    expect(OPENING_RING_INDEX).toEqual({
      red: 0,
      green: 13,
      yellow: 26,
      blue: 39,
    });
    expect(CLASSIC_SAFE_RING_INDEXES).toEqual([
      0, 8, 13, 21, 26, 34, 39, 47,
    ]);
  });

  it.each([
    ["red", 0, 0],
    ["red", 51, 51],
    ["green", 0, 13],
    ["green", 39, 0],
    ["yellow", 26, 0],
    ["blue", 13, 0],
  ] as const)(
    "maps %s progress %i to shared ring index %i",
    (color, progress, ringIndex) => {
      expect(progressToRingIndex(color, progress)).toBe(ringIndex);
    },
  );

  it.each([52, 53, 54, 55, 56, 57])(
    "rejects non-ring progress %i",
    (progress) => {
      expect(() => progressToRingIndex("red", progress)).toThrow(
        "Progress 0 through 51 is required for the shared ring",
      );
    },
  );

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ] as const)("rejects %s progress", (_description, progress) => {
    expect(() => progressToRingIndex("red", progress)).toThrow(
      "Progress 0 through 51 is required for the shared ring",
    );
  });

  it("exposes immutable snapshots with playable-only turn sequences", () => {
    const state = null as unknown as MatchState;
    const result = null as unknown as ApplyActionResult;
    const replayEntry = null as unknown as ReplayEntry;
    const lifecycleAction = {
      type: "set-connection",
      expectedVersion: 1,
      playerId: "player-1",
      connected: false,
    } satisfies MatchAction;

    if (false) {
      // @ts-expect-error Match snapshots are readonly.
      state.version = 2;
      // @ts-expect-error Snapshot collections are readonly.
      state.players.push(state.players[0]);
      // @ts-expect-error Result event collections are readonly.
      result.events.push(result.events[0]);
      // @ts-expect-error Replay entries are readonly.
      replayEntry.stateVersion = 2;
      // @ts-expect-error Replay event collections are readonly.
      replayEntry.events.push(replayEntry.events[0]);
      // @ts-expect-error Lifecycle actions are not playable turn actions.
      const playableAction: PlayableTurnAction = lifecycleAction;
      // @ts-expect-error Turn sequences contain only playable actions.
      const actions: TurnSequence["actions"] = [lifecycleAction];

      void playableAction;
      void actions;
    }

    expect(lifecycleAction.type).toBe("set-connection");
  });
});
