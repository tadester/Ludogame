import type { PlayerColor } from "./types";

export const PLAYER_COLORS: readonly PlayerColor[] = [
  "red",
  "green",
  "yellow",
  "blue",
];

export const OPENING_RING_INDEX: Readonly<Record<PlayerColor, number>> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const CLASSIC_SAFE_RING_INDEXES = [
  0, 8, 13, 21, 26, 34, 39, 47,
] as const;

export const RING_PROGRESS_MAX = 51;
export const HOME_LANE_PROGRESS_MIN = 52;
export const HOME_LANE_PROGRESS_MAX = 56;
export const WON_PROGRESS = 57;
export const TOKENS_PER_PLAYER = 4;

// Extreme mode: power tiles sit on non-safe ring squares (one per quadrant) so
// collecting and shielding both matter. Each grants one shield.
export const EXTREME_POWER_TILES = [
  { ringIndex: 5, power: "shield" as const },
  { ringIndex: 18, power: "dash" as const },
  { ringIndex: 31, power: "shield" as const },
  { ringIndex: 44, power: "dash" as const },
];

/** Fallback powers a tile grants per quadrant when no strategy book is set. */
export const EXTREME_TILE_FALLBACK_POWERS = [
  "shield",
  "dash",
  "warp",
  "snipe",
] as const;

/** Extreme safe squares and power tiles respawn at fresh random spots every
 *  this many turns. */
export const EXTREME_RESPAWN_INTERVAL = 6;

/** Most powers a player may hold at once, to keep Extreme fair. */
export const POWER_INVENTORY_CAP = 3;

/** Extreme map events fire every this many turns, affecting everyone equally
 *  so the board stays unpredictable but fair. */
export const MAP_EVENT_INTERVAL = 7;

/** How far an earthquake slides each exposed (non-safe) token back. */
export const EARTHQUAKE_SETBACK = 4;

/** Ultimate attacks: charge fills to this cap, then can be unleashed once. */
export const ULTIMATE_MAX = 100;
/** Charge the incoming player gains at the start of each of their turns. */
export const ULTIMATE_CHARGE_PER_TURN = 15;
/** Bonus charge for capturing or sending an opponent home. */
export const ULTIMATE_CHARGE_PER_CAPTURE = 35;
/** Charge gained when collecting a power tile. */
export const ULTIMATE_CHARGE_PER_POWER = 15;
/** How far a Quake ultimate knocks each opponent token back. */
export const QUAKE_KNOCKBACK = 8;
