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
