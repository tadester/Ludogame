import { describe, expect, it } from "vitest";

import { buildBoardLayout } from "./board-layout";
import {
  BOARD_SIZE,
  CENTER,
  HOME_LANE,
  RING_PATH,
  YARD_ORIGIN,
  YARD_SLOTS,
} from "./geometry";

describe("buildBoardLayout", () => {
  it("reproduces the classic 52-cell board exactly (H=5, 4 tokens)", () => {
    const layout = buildBoardLayout(5, 4);
    expect(layout.size).toBe(BOARD_SIZE);
    expect(layout.ringLength).toBe(52);
    expect(layout.ringPath).toEqual(RING_PATH);
    expect(layout.homeLane).toEqual(HOME_LANE);
    expect(layout.yardSlots).toEqual(YARD_SLOTS);
    expect(layout.yardOrigin).toEqual(YARD_ORIGIN);
    expect(layout.center).toEqual(CENTER);
    expect(layout.openings).toEqual({ red: 0, green: 13, yellow: 26, blue: 39 });
  });

  it("builds a roughly doubled track for Extreme (H=11, 6 tokens)", () => {
    const layout = buildBoardLayout(11, 6);
    expect(layout.size).toBe(27);
    expect(layout.ringLength).toBe(100);
    expect(layout.ringPath).toHaveLength(100);
    expect(layout.openings).toEqual({ red: 0, green: 25, yellow: 50, blue: 75 });
    // Six resting slots per yard.
    expect(layout.yardSlots.red).toHaveLength(6);
    // Every ring cell sits inside the grid.
    for (const [row, col] of layout.ringPath) {
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(27);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(27);
    }
  });
});
