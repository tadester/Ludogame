import type { Cell, PlayerColor } from "./geometry";

/**
 * A complete board layout (cells on a square grid) generated for a given home-
 * lane length. The classic board uses a home lane of 5 (a 52-cell ring on a
 * 15x15 grid); Extreme uses a longer lane for a roughly doubled track. The
 * generator reproduces the classic hand-authored layout exactly for H = 5.
 */
export interface BoardLayout {
  readonly size: number;
  readonly ringLength: number;
  readonly ringPath: readonly Cell[];
  readonly homeLane: Readonly<Record<PlayerColor, readonly Cell[]>>;
  readonly yardSlots: Readonly<Record<PlayerColor, readonly Cell[]>>;
  readonly yardOrigin: Readonly<Record<PlayerColor, Cell>>;
  readonly center: Cell;
  readonly openings: Readonly<Record<PlayerColor, number>>;
}

const PLAY_ORDER: readonly PlayerColor[] = ["red", "green", "yellow", "blue"];

/** Rotate a cell 90° clockwise on an n×n grid. */
function rotate([row, col]: Cell, n: number): Cell {
  return [col, n - 1 - row];
}

function rotateTimes(cell: Cell, n: number, times: number): Cell {
  let out = cell;
  for (let i = 0; i < times; i += 1) out = rotate(out, n);
  return out;
}

/** Resting-slot offsets within a corner yard block of side `block`. */
function yardOffsets(tokensPerPlayer: number, block: number): Cell[] {
  // The classic 4-token layout is a fixed 2x2 grid; keep it byte-for-byte.
  if (tokensPerPlayer === 4 && block === 6) {
    return [
      [1.5, 1.5],
      [1.5, 3.5],
      [3.5, 1.5],
      [3.5, 3.5],
    ];
  }
  const cols = tokensPerPlayer <= 4 ? 2 : 3;
  const rows = Math.ceil(tokensPerPlayer / cols);
  const slots: Cell[] = [];
  for (let i = 0; i < tokensPerPlayer; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    slots.push([
      (block * (r + 1)) / (rows + 1),
      (block * (c + 1)) / (cols + 1),
    ]);
  }
  return slots;
}

export function buildBoardLayout(
  homeLaneLength: number,
  tokensPerPlayer: number,
): BoardLayout {
  const h = homeLaneLength;
  const mid = h + 2;
  const size = 2 * h + 5;

  // Quadrant 0 (red): out along the row, up the column, across the top.
  const quadrant: Cell[] = [];
  for (let c = 1; c <= h; c += 1) quadrant.push([mid - 1, c]);
  for (let r = mid - 2; r >= 0; r -= 1) quadrant.push([r, mid - 1]);
  quadrant.push([0, mid], [0, mid + 1]);
  const quadrantLength = quadrant.length;

  const ringPath: Cell[] = [];
  for (let q = 0; q < 4; q += 1) {
    for (const cell of quadrant) ringPath.push(rotateTimes(cell, size, q));
  }

  const redHome: Cell[] = [];
  for (let c = 1; c <= h; c += 1) redHome.push([mid, c]);

  const block = mid - 1;
  const redYardOrigin: Cell = [0, 0];
  const redYardSlots = yardOffsets(tokensPerPlayer, block);

  const homeLane = {} as Record<PlayerColor, Cell[]>;
  const yardSlots = {} as Record<PlayerColor, Cell[]>;
  const yardOrigin = {} as Record<PlayerColor, Cell>;
  const openings = {} as Record<PlayerColor, number>;

  PLAY_ORDER.forEach((color, q) => {
    homeLane[color] = redHome.map((cell) => rotateTimes(cell, size, q));
    const origin = rotateCornerOrigin(redYardOrigin, size, block, q);
    yardOrigin[color] = origin;
    yardSlots[color] = redYardSlots.map(([r, c]) => [
      origin[0] + r,
      origin[1] + c,
    ]);
    openings[color] = q * quadrantLength;
  });

  return {
    size,
    ringLength: quadrantLength * 4,
    ringPath,
    homeLane,
    yardSlots,
    yardOrigin,
    center: [mid, mid],
    openings,
  };
}

/** Corner yard origins sit at the four grid corners; rotate red's clockwise. */
function rotateCornerOrigin(
  redOrigin: Cell,
  size: number,
  block: number,
  times: number,
): Cell {
  // Red is top-left [0,0]; the others are the remaining corners clockwise.
  const corners: Cell[] = [
    [0, 0],
    [0, size - block],
    [size - block, size - block],
    [size - block, 0],
  ];
  void redOrigin;
  return corners[times % 4];
}
