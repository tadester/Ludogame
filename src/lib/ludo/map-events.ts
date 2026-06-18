import { progressToRingIndex } from "./board";
import { boardSpec } from "./board-spec";
import {
  CLASSIC_SAFE_RING_INDEXES,
  EARTHQUAKE_SETBACK,
  MAP_EVENT_INTERVAL,
  POWER_INVENTORY_CAP,
} from "./constants";
import type {
  DomainEvent,
  ExtremePowerState,
  MatchState,
  PowerKind,
  TokenState,
} from "./types";

const CLASSIC_SAFE = new Set<number>(CLASSIC_SAFE_RING_INDEXES);
const SPEC = boardSpec("extreme");

export type MapEventKind = "earthquake" | "power-surge";

/** Map events rotate in a fixed order so play stays varied yet predictable for
 *  replays. */
const ROTATION: readonly MapEventKind[] = ["earthquake", "power-surge"];

/**
 * The map event due as the turn numbered `turnNumber` begins, or null. Events
 * fire on every `MAP_EVENT_INTERVAL`-th turn and rotate through `ROTATION`.
 */
export function mapEventDueAt(turnNumber: number): MapEventKind | null {
  if (turnNumber <= 0 || turnNumber % MAP_EVENT_INTERVAL !== 0) return null;
  const occurrence = turnNumber / MAP_EVENT_INTERVAL - 1;
  return ROTATION[occurrence % ROTATION.length];
}

/** Earthquake: every exposed token (active, on a non-safe ring square) slides
 *  back, never below its start. Safe squares and the home lane shield a token. */
function applyEarthquake(
  tokens: readonly TokenState[],
  safe: ReadonlySet<number>,
): readonly TokenState[] {
  return tokens.map((token) => {
    if (
      token.status !== "active" ||
      token.progress === null ||
      token.progress > SPEC.ringProgressMax ||
      safe.has(progressToRingIndex(token.color, token.progress, SPEC))
    ) {
      return token;
    }
    return {
      ...token,
      progress: Math.max(0, token.progress - EARTHQUAKE_SETBACK),
    };
  });
}

/** A power drawn for `playerId` during a surge: their loadout when set
 *  (deterministically, for replay safety), otherwise a shield. */
function surgePower(
  power: ExtremePowerState,
  playerId: string,
  playerIndex: number,
  turnNumber: number,
): PowerKind {
  const loadout = power.loadouts?.[playerId] ?? [];
  if (loadout.length === 0) return "shield";
  const seed = turnNumber * 31 + playerIndex * 7;
  return loadout[((seed % loadout.length) + loadout.length) % loadout.length];
}

/** Power surge: every player below the inventory cap banks one extra power. */
function applyPowerSurge(state: MatchState): ExtremePowerState {
  const power = state.powerUps!;
  const inventory = { ...power.inventory };
  state.players.forEach((player, index) => {
    const held = inventory[player.id] ?? [];
    if (held.length < POWER_INVENTORY_CAP) {
      inventory[player.id] = [
        ...held,
        surgePower(power, player.id, index, state.turnNumber),
      ];
    }
  });
  return { ...power, inventory };
}

/**
 * Apply any map event due as `state` begins its turn. Extreme-only; returns
 * null when no event fires so callers leave the state untouched.
 */
export function applyMapEvent(
  state: MatchState,
): { state: MatchState; event: DomainEvent } | null {
  if (state.ruleset !== "extreme" || !state.powerUps) return null;
  const kind = mapEventDueAt(state.turnNumber);
  if (kind === null) return null;

  const safe = state.powerUps.safeRingIndexes
    ? new Set(state.powerUps.safeRingIndexes)
    : CLASSIC_SAFE;
  const next: MatchState =
    kind === "earthquake"
      ? { ...state, tokens: applyEarthquake(state.tokens, safe) }
      : { ...state, powerUps: applyPowerSurge(state) };

  return {
    state: next,
    event: { type: "map-event", event: kind, turnNumber: state.turnNumber },
  };
}
