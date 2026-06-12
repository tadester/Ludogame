import { OPENING_RING_INDEX, RING_PROGRESS_MAX } from "./constants";
import type { PlayerColor } from "./types";

export function progressToRingIndex(
  color: PlayerColor,
  progress: number,
): number {
  if (
    !Number.isInteger(progress) ||
    progress < 0 ||
    progress > RING_PROGRESS_MAX
  ) {
    throw new Error("Progress 0 through 51 is required for the shared ring");
  }

  return (OPENING_RING_INDEX[color] + progress) % 52;
}
