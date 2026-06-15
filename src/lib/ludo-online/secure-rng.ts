import { randomInt } from "node:crypto";

import type { DiceRng } from "./authority";

/** A cryptographically secure, unbiased dice RNG for trusted server use. */
export function secureDiceRng(): DiceRng {
  return () => randomInt(1, 7);
}
