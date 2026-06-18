import { boardSpec, ringIndexFor } from "./board-spec";
import type { BoardSpec } from "./board-spec";
import type { PlayerColor } from "./types";

const CLASSIC = boardSpec("classic");

export function progressToRingIndex(
  color: PlayerColor,
  progress: number,
  spec: BoardSpec = CLASSIC,
): number {
  if (
    !Number.isInteger(progress) ||
    progress < 0 ||
    progress > spec.ringProgressMax
  ) {
    throw new Error(
      `Progress 0 through ${spec.ringProgressMax} is required for the shared ring`,
    );
  }

  return ringIndexFor(spec, color, progress);
}
