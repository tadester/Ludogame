import {
  applyAction,
  CLASSIC_SAFE_RING_INDEXES,
  createMatch,
  getLegalActions,
  progressToRingIndex,
} from "@/lib/ludo";
import { boardSpec } from "@/lib/ludo/board-spec";
import type {
  LegalAction,
  MatchAction,
  MatchState,
  PowerKind,
  Ruleset,
  UltimateKind,
} from "@/lib/ludo";

import { PLAY_ORDER } from "./geometry";
import type { PlayerColor } from "./geometry";

const CLASSIC_SAFE = new Set<number>(CLASSIC_SAFE_RING_INDEXES);

function safeRingsFor(state: MatchState): ReadonlySet<number> {
  const custom =
    state.ruleset === "extreme" ? state.powerUps?.safeRingIndexes : undefined;
  return custom ? new Set(custom) : CLASSIC_SAFE;
}

export interface LocalPlayerSetup {
  readonly name: string;
  readonly kind?: "human" | "bot";
}

export interface LocalSeat {
  readonly id: string;
  readonly color: PlayerColor;
  readonly displayName: string;
}

/** Builds a started pass-the-phone match with 2-4 seated human players. In
 *  Extreme mode an optional strategy-book loadout decides which powers the
 *  tiles can grant; it is shared by every seat so local play stays fair. */
export function setupLocalMatch(
  players: readonly LocalPlayerSetup[],
  ruleset: Ruleset = "classic",
  loadout: readonly PowerKind[] = [],
  ultimate?: UltimateKind,
): MatchState {
  const seats = players.map<LocalSeat>((player, index) => {
    const color = PLAY_ORDER[index];
    const bot = player.kind === "bot";
    return {
      id: bot ? `bot${index + 1}` : `p${index + 1}`,
      color,
      displayName: player.name.trim() || defaultName(color, bot),
    };
  });

  let state = createMatch({
    id: `local-${Date.now()}`,
    ruleset,
    maxPlayers: seats.length as 2 | 3 | 4,
    host: seats[0],
  });

  for (const seat of seats.slice(1)) {
    state = applyAction(state, {
      type: "join-seat",
      expectedVersion: state.version,
      player: seat,
    }).state;
  }

  state = applyAction(state, {
    type: "start-match",
    expectedVersion: state.version,
    playerId: seats[0].id,
  }).state;

  if (ruleset === "extreme" && state.powerUps) {
    let powerUps = state.powerUps;
    if (loadout.length > 0) {
      const loadouts = Object.fromEntries(
        seats.map((seat) => [seat.id, [...loadout]]),
      );
      powerUps = { ...powerUps, loadouts };
    }
    if (ultimate) {
      const ultimateLoadout = Object.fromEntries(
        seats.map((seat) => [seat.id, ultimate]),
      );
      powerUps = { ...powerUps, ultimateLoadout };
    }
    state = { ...state, powerUps };
  }

  return state;
}

export function defaultName(color: PlayerColor, bot = false): string {
  const name = color.charAt(0).toUpperCase() + color.slice(1);
  return bot ? `Bot ${name}` : name;
}

export function isBotPlayerId(playerId: string): boolean {
  return playerId.startsWith("bot");
}

/** A `roll-dice` action carrying a deterministic, replay-stable die id. */
export function rollAction(state: MatchState, value: number): MatchAction {
  return rollActionFor(state, [value]);
}

/** How many dice the active ruleset rolls each turn. */
export function diceCountFor(ruleset: Ruleset): number {
  return ruleset === "nigerian" ? 2 : 1;
}

/** A `roll-dice` action for one or two dice with stable, unique ids. */
export function rollActionFor(
  state: MatchState,
  values: readonly number[],
): MatchAction {
  const playerId = state.players[state.activePlayerIndex].id;
  return {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId,
    dice: values.map((value, index) => ({
      id: `roll-${state.turnNumber}-${state.rollNumber}-${index}`,
      value: value as 1 | 2 | 3 | 4 | 5 | 6,
    })),
  };
}

/**
 * The token and from/to progress a release or move action produces, so the UI
 * can animate it without knowing ruleset-specific dice details.
 */
export function actionDestination(
  state: MatchState,
  action: LegalAction,
): { tokenId: string; from: number | null; to: number } | null {
  if (action.type === "release-token") {
    return { tokenId: action.tokenId, from: null, to: 0 };
  }
  if (action.type === "move-token") {
    const token = state.tokens.find((t) => t.id === action.tokenId);
    if (!token) return null;
    const dice = state.pendingRoll?.dice ?? [];
    const distance = action.dieIds.reduce(
      (sum, dieId) => sum + (dice.find((d) => d.id === dieId)?.value ?? 0),
      0,
    );
    const from = token.progress;
    return { tokenId: action.tokenId, from, to: (from ?? 0) + distance };
  }
  return null;
}

/** The die-order choices offered while awaiting a Nigerian die-order pick. */
export function dieOrderOptions(
  actions: readonly LegalAction[],
): { dieIds: readonly string[]; action: LegalAction }[] {
  return actions
    .filter((action) => action.type === "select-die-order")
    .map((action) => ({
      dieIds: (action as { dieIds: readonly string[] }).dieIds,
      action,
    }));
}

/** Maps each currently-movable token id to the legal action that moves it. */
export function legalMovesByToken(
  state: MatchState,
  actions: readonly LegalAction[],
): Map<string, LegalAction> {
  const byToken = new Map<string, LegalAction>();
  for (const action of actions) {
    if (action.type === "move-token" || action.type === "release-token") {
      byToken.set(action.tokenId, action);
    }
  }
  return byToken;
}

export function botActionFor(
  state: MatchState,
  rollValues?: readonly number[],
): MatchAction | null {
  if (state.status !== "active") return null;
  if (state.phase === "awaiting-roll") {
    if (!rollValues) return null;
    return rollActionFor(state, rollValues);
  }

  const actions = getLegalActions(state);
  if (state.phase === "awaiting-die-order") {
    return dieOrderOptions(actions)[0]?.action ?? null;
  }

  const moves = [...legalMovesByToken(state, actions).values()];
  if (moves.length === 0) return null;
  return moves.reduce((best, action) =>
    botMoveScore(state, action) > botMoveScore(state, best) ? action : best,
  );
}

function botMoveScore(state: MatchState, action: LegalAction): number {
  const dest = actionDestination(state, action);
  if (!dest) return -1;
  const token = state.tokens.find((t) => t.id === dest.tokenId);
  if (!token) return -1;
  const spec = boardSpec(state.ruleset);

  let score = dest.to;
  // Get tokens off the yard so the bot keeps options open.
  if (token.status === "yard") score += 6;
  // Finishing a token home is the goal.
  if (dest.to >= spec.wonProgress) score += 40;

  if (dest.to <= spec.ringProgressMax) {
    const ring = progressToRingIndex(token.color, dest.to, spec);
    const safe = safeRingsFor(state);
    const shielded = new Set(state.powerUps?.shieldedTokenIds ?? []);
    // Capturing an exposed opponent is the strongest play.
    const captures =
      state.ruleset !== "peaceful" &&
      !safe.has(ring) &&
      state.tokens.some(
        (other) =>
          other.playerId !== token.playerId &&
          other.status === "active" &&
          other.progress !== null &&
          other.progress <= spec.ringProgressMax &&
          progressToRingIndex(other.color, other.progress, spec) === ring &&
          !shielded.has(other.id),
      );
    if (captures) score += 60;
    // Otherwise, prefer landing somewhere safe.
    if (safe.has(ring)) score += 8;
  }
  return score;
}

export function rollDie(): number {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("Secure browser crypto is required to roll dice.");
  }

  const max = Math.floor(0x100000000 / 6) * 6;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= max);

  return (buffer[0] % 6) + 1;
}
