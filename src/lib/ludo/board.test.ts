import { describe, expect, it } from "vitest";

import {
  CLASSIC_SAFE_RING_INDEXES,
  OPENING_RING_INDEX,
  progressToRingIndex,
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
});
