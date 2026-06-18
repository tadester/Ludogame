import { applyAction, createMatch } from "@/lib/ludo";
import type {
  ApplyActionResult,
  Die,
  MatchAction,
  MatchState,
  Ruleset,
} from "@/lib/ludo";
import { PLAY_ORDER } from "@/lib/ludo-ui/geometry";

/** A seated room member, ready to be placed into an online match. */
export interface OnlineSeat {
  readonly userId: string;
  readonly displayName: string;
  readonly seat: number;
}

/** Returns a die value 1-6. Injected so production can use a CSPRNG and tests
 *  can stay deterministic. */
export type DiceRng = () => number;

/** Number of dice the ruleset rolls each turn. */
export function diceCountForRuleset(ruleset: Ruleset): number {
  return ruleset === "nigerian" ? 2 : 1;
}

/** Build and start an online match by seating members in seat order and
 *  assigning colors from the shared play order. */
export function buildStartedMatch(
  matchId: string,
  seats: readonly OnlineSeat[],
  ruleset: Ruleset,
  turnTimerSeconds: number | null = null,
): MatchState {
  const ordered = [...seats].sort((a, b) => a.seat - b.seat);
  if (ordered.length < 2 || ordered.length > 4) {
    throw new Error("An online match needs two to four players.");
  }

  // A user may hold several seats; each seat becomes its own colored player,
  // and the owner is encoded in the player id so we can authorize moves.
  const owners = new Map<string, number>();
  const colored = ordered.map((seat, index) => {
    const color = PLAY_ORDER[index];
    const seatCount = (owners.get(seat.userId) ?? 0) + 1;
    owners.set(seat.userId, seatCount);
    const ownsMany = ordered.filter((s) => s.userId === seat.userId).length > 1;
    return {
      id: `${seat.userId}${SEAT_SEPARATOR}${color}`,
      color,
      displayName: ownsMany
        ? `${seat.displayName} (${color})`
        : seat.displayName,
    };
  });

  let state = createMatch({
    id: matchId,
    ruleset,
    maxPlayers: colored.length as 2 | 3 | 4,
    turnTimerSeconds,
    host: colored[0],
  });

  for (const player of colored.slice(1)) {
    state = applyAction(state, {
      type: "join-seat",
      expectedVersion: state.version,
      player,
    }).state;
  }

  return applyAction(state, {
    type: "start-match",
    expectedVersion: state.version,
    playerId: colored[0].id,
  }).state;
}

/** Separator between a seat's owner id and its color in a player id. uuids
 *  never contain it, so the owner is always recoverable. */
export const SEAT_SEPARATOR = "#";

/** The user id that owns a given engine player id (seat). */
export function seatOwner(playerId: string): string {
  const index = playerId.indexOf(SEAT_SEPARATOR);
  return index === -1 ? playerId : playerId.slice(0, index);
}

/** Generate dice with deterministic, replay-stable ids for the current roll. */
export function serverRoll(
  state: MatchState,
  rng: DiceRng,
  count = diceCountForRuleset(state.ruleset),
): Die[] {
  return Array.from({ length: count }, (_, index) => {
    const value = Math.floor(rng());
    if (!Number.isInteger(value) || value < 1 || value > 6) {
      throw new Error("Dice RNG must yield an integer from 1 to 6.");
    }
    return {
      id: `roll-${state.turnNumber}-${state.rollNumber}-${index}`,
      value: value as 1 | 2 | 3 | 4 | 5 | 6,
    };
  });
}

/** A client's intended turn action, before the server attaches authority
 *  details (version, generated dice). */
export type ServerIntent =
  | { readonly kind: "roll" }
  | { readonly kind: "select-die-order"; readonly dieIds: readonly string[] }
  | {
      readonly kind: "release-token";
      readonly tokenId: string;
      readonly dieId: string;
    }
  | {
      readonly kind: "move-token";
      readonly tokenId: string;
      readonly dieIds: readonly string[];
    };

/** Parse and validate an untrusted intent payload (e.g. a request body). */
export function parseServerIntent(value: unknown): ServerIntent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const stringArray = (x: unknown): x is string[] =>
    Array.isArray(x) && x.every((item) => typeof item === "string");

  switch (v.kind) {
    case "roll":
      return { kind: "roll" };
    case "select-die-order":
      return stringArray(v.dieIds)
        ? { kind: "select-die-order", dieIds: v.dieIds }
        : null;
    case "release-token":
      return typeof v.tokenId === "string" && typeof v.dieId === "string"
        ? { kind: "release-token", tokenId: v.tokenId, dieId: v.dieId }
        : null;
    case "move-token":
      return typeof v.tokenId === "string" && stringArray(v.dieIds)
        ? { kind: "move-token", tokenId: v.tokenId, dieIds: v.dieIds }
        : null;
    default:
      return null;
  }
}

export class NotYourTurnError extends Error {
  constructor() {
    super("It is not that player's turn.");
    this.name = "NotYourTurnError";
  }
}

/** Validate that the requester is the active player, then apply their intent
 *  through the rules engine — generating dice server-side for rolls. */
export function resolveIntent(
  state: MatchState,
  userId: string,
  intent: ServerIntent,
  rng: DiceRng,
): ApplyActionResult {
  if (state.status !== "active") {
    throw new Error("The match is not in progress.");
  }
  const active = state.players[state.activePlayerIndex];
  if (!active || seatOwner(active.id) !== userId) {
    throw new NotYourTurnError();
  }

  const action = buildAction(state, active.id, intent, rng);
  return applyAction(state, action);
}

function buildAction(
  state: MatchState,
  playerId: string,
  intent: ServerIntent,
  rng: DiceRng,
): MatchAction {
  const base = { expectedVersion: state.version, playerId } as const;
  switch (intent.kind) {
    case "roll":
      return { type: "roll-dice", ...base, dice: serverRoll(state, rng) };
    case "select-die-order":
      return { type: "select-die-order", ...base, dieIds: intent.dieIds };
    case "release-token":
      return {
        type: "release-token",
        ...base,
        tokenId: intent.tokenId,
        dieId: intent.dieId,
      };
    case "move-token":
      return {
        type: "move-token",
        ...base,
        tokenId: intent.tokenId,
        dieIds: intent.dieIds,
      };
  }
}
