import {
  HOME_LANE_PROGRESS_MAX,
  OPENING_RING_INDEX,
  RING_PROGRESS_MAX,
  TOKENS_PER_PLAYER,
  WON_PROGRESS,
} from "./constants";
import type { PlayerColor, Ruleset } from "./types";

/**
 * The track dimensions for a ruleset. Every mode except Extreme uses the
 * classic 52-cell ring with 4 tokens; Extreme uses a roughly doubled 100-cell
 * ring with 6 tokens. Deriving these from the ruleset (rather than fixed
 * constants) lets the shared movement engine drive both board sizes.
 */
export interface BoardSpec {
  readonly ringLength: number;
  readonly ringProgressMax: number;
  readonly homeLaneMin: number;
  readonly homeLaneMax: number;
  readonly wonProgress: number;
  readonly tokensPerPlayer: number;
  readonly openings: Readonly<Record<PlayerColor, number>>;
}

const CLASSIC_SPEC: BoardSpec = {
  ringLength: 52,
  ringProgressMax: RING_PROGRESS_MAX,
  homeLaneMin: 52,
  homeLaneMax: HOME_LANE_PROGRESS_MAX,
  wonProgress: WON_PROGRESS,
  tokensPerPlayer: TOKENS_PER_PLAYER,
  openings: OPENING_RING_INDEX,
};

// Extreme: home lane of 11 → a 100-cell ring (≈ double), openings a quarter
// apart, and six tokens per player.
const EXTREME_RING_LENGTH = 100;
const EXTREME_HOME_LANE = 11;
const EXTREME_SPEC: BoardSpec = {
  ringLength: EXTREME_RING_LENGTH,
  ringProgressMax: EXTREME_RING_LENGTH - 1,
  homeLaneMin: EXTREME_RING_LENGTH,
  homeLaneMax: EXTREME_RING_LENGTH + EXTREME_HOME_LANE - 1,
  wonProgress: EXTREME_RING_LENGTH + EXTREME_HOME_LANE,
  tokensPerPlayer: 6,
  openings: { red: 0, green: 25, yellow: 50, blue: 75 },
};

export function boardSpec(ruleset: Ruleset): BoardSpec {
  return ruleset === "extreme" ? EXTREME_SPEC : CLASSIC_SPEC;
}

/** Ring index of a color's token at a ring progress, for the given spec. */
export function ringIndexFor(
  spec: BoardSpec,
  color: PlayerColor,
  progress: number,
): number {
  return (spec.openings[color] + progress) % spec.ringLength;
}
