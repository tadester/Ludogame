import { describe, expect, it } from "vitest";

import { extremeLayout, respawnEpoch } from "./extreme-spawn";

const QUADRANTS = [0, 25, 50, 75];
const quadrantOf = (ring: number) => Math.floor(ring / 25);

describe("extremeLayout", () => {
  it("is deterministic for the same match id and epoch", () => {
    expect(extremeLayout("match-A", 0)).toEqual(extremeLayout("match-A", 0));
  });

  it("changes the layout across epochs", () => {
    const a = extremeLayout("match-A", 0);
    const b = extremeLayout("match-A", 1);
    expect(a).not.toEqual(b);
  });

  it("keeps every colour opening safe", () => {
    const { safeRingIndexes } = extremeLayout("match-A", 3);
    for (const opening of QUADRANTS) {
      expect(safeRingIndexes).toContain(opening);
    }
  });

  it("places two extra safe squares and one tile in each quadrant", () => {
    const { safeRingIndexes, tiles } = extremeLayout("match-A", 2);
    expect(tiles).toHaveLength(4);
    // Four openings plus two random safe squares per quadrant.
    expect(safeRingIndexes).toHaveLength(12);
    // No duplicate safe squares.
    expect(new Set(safeRingIndexes).size).toBe(safeRingIndexes.length);
    for (let q = 0; q < 4; q += 1) {
      expect(tiles.filter((t) => quadrantOf(t.ringIndex) === q)).toHaveLength(1);
      const nonOpeningSafe = safeRingIndexes.filter(
        (idx) => quadrantOf(idx) === q && !QUADRANTS.includes(idx),
      );
      expect(nonOpeningSafe).toHaveLength(2);
    }
  });

  it("never puts a tile on a safe square and keeps rings in range", () => {
    for (let epoch = 0; epoch < 12; epoch += 1) {
      const { safeRingIndexes, tiles } = extremeLayout("seed", epoch);
      const safe = new Set(safeRingIndexes);
      for (const tile of tiles) {
        expect(tile.ringIndex).toBeGreaterThanOrEqual(0);
        expect(tile.ringIndex).toBeLessThanOrEqual(99);
        expect(safe.has(tile.ringIndex)).toBe(false);
      }
    }
  });
});

describe("respawnEpoch", () => {
  it("buckets turns into fixed intervals", () => {
    expect(respawnEpoch(0, 6)).toBe(0);
    expect(respawnEpoch(5, 6)).toBe(0);
    expect(respawnEpoch(6, 6)).toBe(1);
    expect(respawnEpoch(13, 6)).toBe(2);
  });
});
