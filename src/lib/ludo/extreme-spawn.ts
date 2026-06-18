import { EXTREME_TILE_FALLBACK_POWERS } from "./constants";
import type { PowerKind, PowerTile } from "./types";

/** The four ring quadrants. Each quadrant starts at a colour opening. */
const QUADRANT_STARTS = [0, 13, 26, 39] as const;
const QUADRANT_SIZE = 13;

export interface ExtremeLayout {
  readonly safeRingIndexes: number[];
  readonly tiles: PowerTile[];
}

/** Stable string hash (FNV-1a) so a match id seeds the same layout every time. */
function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A small deterministic PRNG (LCG) returning values in [0, 1). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Generate the Extreme board layout for a given respawn epoch: one safe square
 * and one power tile placed at random within each of the four quadrants (a set
 * amount per side, random position), plus the four colour openings kept safe so
 * releasing a token is never an instant loss. Fully deterministic in the match
 * id and epoch, so online play and replays stay identical.
 */
export function extremeLayout(matchId: string, epoch: number): ExtremeLayout {
  const rand = lcg(hashSeed(matchId) ^ Math.imul(epoch + 1, 2654435761));
  const safeRingIndexes: number[] = [...QUADRANT_STARTS];
  const tiles: PowerTile[] = [];

  QUADRANT_STARTS.forEach((start, quadrant) => {
    const safeOffset = 1 + Math.floor(rand() * (QUADRANT_SIZE - 1));
    safeRingIndexes.push(start + safeOffset);

    let tileOffset = 1 + Math.floor(rand() * (QUADRANT_SIZE - 1));
    if (tileOffset === safeOffset) {
      tileOffset = (safeOffset % (QUADRANT_SIZE - 1)) + 1;
    }
    const power: PowerKind =
      EXTREME_TILE_FALLBACK_POWERS[quadrant % EXTREME_TILE_FALLBACK_POWERS.length];
    tiles.push({ ringIndex: start + tileOffset, power });
  });

  return { safeRingIndexes, tiles };
}

/** The respawn epoch for a turn number, given the respawn cadence. */
export function respawnEpoch(turnNumber: number, interval: number): number {
  return Math.floor(Math.max(0, turnNumber) / interval);
}
