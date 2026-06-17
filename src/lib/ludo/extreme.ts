import { progressToRingIndex } from "./board";
import {
  CLASSIC_SAFE_RING_INDEXES,
  POWER_INVENTORY_CAP,
  RING_PROGRESS_MAX,
} from "./constants";
import { requireActiveMatch, requireActivePlayer } from "./turn-flow";
import { LudoRuleError } from "./types";
import type {
  ApplyActionResult,
  DomainEvent,
  ExtremePowerState,
  MatchAction,
  MatchState,
  PowerKind,
  TokenState,
} from "./types";

const CLASSIC_SAFE = new Set<number>(CLASSIC_SAFE_RING_INDEXES);

/** Powers a player currently holds (empty when they hold none). */
export function powersOf(
  state: MatchState,
  playerId: string,
): readonly PowerKind[] {
  return state.powerUps?.inventory[playerId] ?? [];
}

export function isShielded(state: MatchState, tokenId: string): boolean {
  return state.powerUps?.shieldedTokenIds.includes(tokenId) ?? false;
}

/**
 * Resolve a token landing on `ringIndex` in Extreme mode: capture opponents
 * there (unless a square is safe or the target is shielded), then let the mover
 * collect any power tile on that square.
 */
export function resolveExtremeLanding(
  state: MatchState,
  moverId: string,
  ringIndex: number,
): {
  tokens: readonly TokenState[];
  powerUps: ExtremePowerState;
  events: DomainEvent[];
} {
  const power = state.powerUps!;
  const events: DomainEvent[] = [];
  let shieldedTokenIds = power.shieldedTokenIds;
  let tokens = state.tokens;

  if (!CLASSIC_SAFE.has(ringIndex)) {
    tokens = tokens.map((token) => {
      const opposing =
        token.playerId !== moverId &&
        token.status === "active" &&
        token.progress !== null &&
        token.progress <= RING_PROGRESS_MAX &&
        progressToRingIndex(token.color, token.progress) === ringIndex;
      if (!opposing) return token;
      if (shieldedTokenIds.includes(token.id)) {
        shieldedTokenIds = shieldedTokenIds.filter((id) => id !== token.id);
        events.push({
          type: "capture-blocked",
          playerId: token.playerId,
          tokenId: token.id,
          ringIndex,
        });
        return token;
      }
      events.push({
        type: "token-captured",
        playerId: moverId,
        tokenId: token.id,
        capturedTokenId: token.id,
        ringIndex,
      });
      return { ...token, status: "yard" as const, progress: null };
    });
  }

  let tiles = power.tiles;
  let inventory = power.inventory;
  const tile = tiles.find((entry) => entry.ringIndex === ringIndex);
  if (tile) {
    const held = inventory[moverId] ?? [];
    if (held.length < POWER_INVENTORY_CAP) {
      tiles = tiles.filter((entry) => entry.ringIndex !== ringIndex);
      inventory = { ...inventory, [moverId]: [...held, tile.power] };
      events.push({
        type: "power-collected",
        playerId: moverId,
        power: tile.power,
        ringIndex,
      });
    }
  }

  return { tokens, powerUps: { tiles, inventory, shieldedTokenIds }, events };
}

/** Spend a held power. v1: shield one of your own active tokens from the next
 *  capture. Allowed on your turn before you roll. */
export function applyUsePower(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
): ApplyActionResult {
  requireActiveMatch(state);
  requireActivePlayer(state, action.playerId);
  if (state.ruleset !== "extreme" || !state.powerUps) {
    throw new LudoRuleError("INVALID_ACTION", "Powers are only for Extreme mode");
  }
  if (state.phase !== "awaiting-roll") {
    throw new LudoRuleError("INVALID_ACTION", "Use powers before rolling");
  }
  if (action.power !== "shield") {
    throw new LudoRuleError("INVALID_ACTION", `Unknown power ${action.power}`);
  }

  const held = powersOf(state, action.playerId);
  const index = held.indexOf("shield");
  if (index === -1) {
    throw new LudoRuleError("INVALID_ACTION", "You have no shield to use");
  }

  const token = state.tokens.find((entry) => entry.id === action.tokenId);
  if (!token || token.playerId !== action.playerId) {
    throw new LudoRuleError("INVALID_ACTION", "That is not your token");
  }
  if (token.status !== "active") {
    throw new LudoRuleError("INVALID_ACTION", "Only active tokens can be shielded");
  }
  if (state.powerUps.shieldedTokenIds.includes(token.id)) {
    throw new LudoRuleError("INVALID_ACTION", "That token is already shielded");
  }

  const remaining = [...held.slice(0, index), ...held.slice(index + 1)];
  const powerUps: ExtremePowerState = {
    ...state.powerUps,
    inventory: { ...state.powerUps.inventory, [action.playerId]: remaining },
    shieldedTokenIds: [...state.powerUps.shieldedTokenIds, token.id],
  };

  return {
    state: { ...state, powerUps },
    events: [
      {
        type: "power-used",
        playerId: action.playerId,
        power: "shield",
        tokenId: token.id,
      },
    ],
  };
}
