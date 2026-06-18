import {
  CLASSIC_SAFE_RING_INDEXES,
  OPENING_RING_INDEX,
  progressToRingIndex,
} from "@/lib/ludo";
import type { MatchState, Ruleset } from "@/lib/ludo";

import { buildBoardLayout } from "./board-layout";
import type { BoardLayout } from "./board-layout";

export type PlayerColor = MatchState["tokens"][number]["color"];
export type Cell = readonly [row: number, col: number];

export const BOARD_SIZE = 15;
export const PLAY_ORDER: readonly PlayerColor[] = [
  "red",
  "green",
  "yellow",
  "blue",
];

/**
 * The 52 shared-ring cells as [row, col] on a 15x15 grid, traced clockwise
 * from red's opening square. Index `i` here is the engine's shared ring index,
 * so `RING_PATH[progressToRingIndex(color, progress)]` is a token's cell.
 */
export const RING_PATH: readonly Cell[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // 0-4   red opening + left arm
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // 5-10  up the top arm
  [0, 7], [0, 8], // 11-12 across the top
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 13-17 green opening + down
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18-23 right arm
  [7, 14], [8, 14], // 24-25 across the right
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 26-30 yellow opening + back
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // 31-36 down bottom arm
  [14, 7], [14, 6], // 37-38 across the bottom
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 39-43 blue opening + up
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // 44-49 left arm bottom row
  [7, 0], [6, 0], // 50-51 across the left, back to start
];

/** The five private home-lane cells per color (engine progress 52..56). */
export const HOME_LANE: Readonly<Record<PlayerColor, readonly Cell[]>> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

/** The shared home triangle at the board's center (engine progress 57). */
export const CENTER: Cell = [7, 7];

/** The four resting slots inside each color's corner yard. */
export const YARD_SLOTS: Readonly<Record<PlayerColor, readonly Cell[]>> = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  green: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  blue: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};

/** Corner yard blocks as grid spans [rowStart, colStart] (each 6x6). */
export const YARD_ORIGIN: Readonly<Record<PlayerColor, Cell>> = {
  red: [0, 0],
  green: [0, 9],
  yellow: [9, 9],
  blue: [9, 0],
};

export const SAFE_RING_INDEXES: ReadonlySet<number> = new Set(
  CLASSIC_SAFE_RING_INDEXES,
);

export const RING_INDEX_TO_COLOR: Readonly<Record<number, PlayerColor>> =
  PLAY_ORDER.reduce<Record<number, PlayerColor>>((map, color) => {
    map[OPENING_RING_INDEX[color]] = color;
    return map;
  }, {});

export function tokenSlotIndex(tokenId: string): number {
  const parts = tokenId.split("-token-");
  const slot = Number.parseInt(parts[1] ?? "1", 10);
  return Number.isFinite(slot) ? slot - 1 : 0;
}

/** The cell occupied by a token at a given progress (null progress = yard). */
export function cellForProgress(
  color: PlayerColor,
  progress: number | null,
  slotIndex: number,
): Cell {
  if (progress === null) {
    return YARD_SLOTS[color][slotIndex] ?? YARD_SLOTS[color][0];
  }
  if (progress <= 51) {
    return RING_PATH[progressToRingIndex(color, progress)];
  }
  if (progress <= 56) {
    return HOME_LANE[color][progress - 52];
  }
  return CENTER;
}

/**
 * The ordered cells a token visibly steps through when moving from `from` to
 * `to`, used to animate the token hopping along the track one cell at a time.
 */
export function moveWaypoints(
  color: PlayerColor,
  from: number | null,
  to: number,
): Cell[] {
  const start = from === null ? 0 : from + 1;
  const cells: Cell[] = [];
  for (let progress = start; progress <= to; progress += 1) {
    cells.push(cellForProgress(color, progress, 0));
  }
  if (cells.length === 0) {
    cells.push(cellForProgress(color, to, 0));
  }
  return cells;
}

/** Percentage offsets (of board size) to a cell center, for absolute layout. */
export function cellToPercent(cell: Cell): { left: number; top: number } {
  const [row, col] = cell;
  return {
    left: ((col + 0.5) / BOARD_SIZE) * 100,
    top: ((row + 0.5) / BOARD_SIZE) * 100,
  };
}

// --- Variable-size board support (Extreme uses a larger generated board) ---

const LAYOUT_CACHE = new Map<Ruleset, BoardLayout>();

/** The board layout for a ruleset. Classic family + Nigerian use the standard
 *  52-cell board; Extreme uses a roughly doubled 100-cell board with 6 tokens. */
export function getBoardLayout(ruleset: Ruleset): BoardLayout {
  let layout = LAYOUT_CACHE.get(ruleset);
  if (!layout) {
    layout =
      ruleset === "extreme" ? buildBoardLayout(11, 6) : buildBoardLayout(5, 4);
    LAYOUT_CACHE.set(ruleset, layout);
  }
  return layout;
}

function ringIndexOn(
  layout: BoardLayout,
  color: PlayerColor,
  progress: number,
): number {
  return (layout.openings[color] + progress) % layout.ringLength;
}

/** Opening ring index → owning color, for a layout. */
export function ringIndexToColor(
  layout: BoardLayout,
): Readonly<Record<number, PlayerColor>> {
  const map: Record<number, PlayerColor> = {};
  for (const color of PLAY_ORDER) map[layout.openings[color]] = color;
  return map;
}

/** The cell a token occupies at a given progress, on a specific layout. */
export function cellForProgressOn(
  layout: BoardLayout,
  color: PlayerColor,
  progress: number | null,
  slotIndex: number,
): Cell {
  if (progress === null) {
    return layout.yardSlots[color][slotIndex] ?? layout.yardSlots[color][0];
  }
  const homeMax = layout.ringLength + layout.homeLane[color].length - 1;
  if (progress <= layout.ringLength - 1) {
    return layout.ringPath[ringIndexOn(layout, color, progress)];
  }
  if (progress <= homeMax) {
    return layout.homeLane[color][progress - layout.ringLength];
  }
  return layout.center;
}

/** The cells a token visibly steps through from `from` to `to`, on a layout. */
export function moveWaypointsOn(
  layout: BoardLayout,
  color: PlayerColor,
  from: number | null,
  to: number,
): Cell[] {
  const start = from === null ? 0 : from + 1;
  const cells: Cell[] = [];
  for (let progress = start; progress <= to; progress += 1) {
    cells.push(cellForProgressOn(layout, color, progress, 0));
  }
  if (cells.length === 0) {
    cells.push(cellForProgressOn(layout, color, to, 0));
  }
  return cells;
}

/** Percentage offsets to a cell center for a layout of the given size. */
export function cellToPercentOn(
  layout: BoardLayout,
  cell: Cell,
): { left: number; top: number } {
  const [row, col] = cell;
  return {
    left: ((col + 0.5) / layout.size) * 100,
    top: ((row + 0.5) / layout.size) * 100,
  };
}
