import { describe, expect, it } from "vitest";

import { OPENING_RING_INDEX, progressToRingIndex } from "@/lib/ludo";

import {
  CENTER,
  HOME_LANE,
  PLAY_ORDER,
  RING_PATH,
  cellForProgress,
  moveWaypoints,
} from "./geometry";

const manhattan = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const chebyshev = (a: readonly number[], b: readonly number[]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

describe("board geometry", () => {
  it("has 52 unique cells forming a closed loop", () => {
    expect(RING_PATH).toHaveLength(52);
    expect(new Set(RING_PATH.map(([r, c]) => `${r},${c}`)).size).toBe(52);
    // Steps are edge-adjacent along arms; the four inner arm corners cut
    // diagonally between cell centers, as on a real Ludo board.
    for (let i = 0; i < 52; i += 1) {
      expect(chebyshev(RING_PATH[i], RING_PATH[(i + 1) % 52])).toBe(1);
    }
  });

  it("places each color's opening on its engine ring index", () => {
    for (const color of PLAY_ORDER) {
      const opening = RING_PATH[OPENING_RING_INDEX[color]];
      expect(cellForProgress(color, 0, 0)).toEqual(opening);
    }
  });

  it("keeps home lanes straight, contiguous, and aimed at the center", () => {
    for (const color of PLAY_ORDER) {
      const lane = HOME_LANE[color];
      expect(lane).toHaveLength(5);
      // first lane cell sits next to the ring cell at progress 51
      const lastRing = RING_PATH[progressToRingIndex(color, 51)];
      expect(chebyshev(lane[0], lastRing)).toBe(1);
      for (let i = 0; i < 4; i += 1) {
        expect(manhattan(lane[i], lane[i + 1])).toBe(1);
      }
      // the final lane cell borders the shared center region (rows/cols 6-8)
      const towardCenter = Math.min(
        manhattan(lane[4], [CENTER[0], CENTER[1] - 1]),
        manhattan(lane[4], [CENTER[0], CENTER[1] + 1]),
        manhattan(lane[4], [CENTER[0] - 1, CENTER[1]]),
        manhattan(lane[4], [CENTER[0] + 1, CENTER[1]]),
      );
      expect(towardCenter).toBe(1);
    }
  });

  it("maps progress through ring, home lane, and center", () => {
    expect(cellForProgress("red", 0, 0)).toEqual(RING_PATH[0]);
    expect(cellForProgress("red", 52, 0)).toEqual(HOME_LANE.red[0]);
    expect(cellForProgress("red", 56, 0)).toEqual(HOME_LANE.red[4]);
    expect(cellForProgress("red", 57, 0)).toEqual(CENTER);
  });

  it("produces step-by-step waypoints, including a single release hop", () => {
    expect(moveWaypoints("red", null, 0)).toEqual([RING_PATH[0]]);
    expect(moveWaypoints("red", 7, 10)).toEqual([
      cellForProgress("red", 8, 0),
      cellForProgress("red", 9, 0),
      cellForProgress("red", 10, 0),
    ]);
  });
});
