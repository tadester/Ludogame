import { progressToRingIndex } from "./board";
import { boardSpec } from "./board-spec";
import {
  ULTIMATE_CHARGE_PER_TURN,
  ULTIMATE_MAX,
  QUAKE_KNOCKBACK,
} from "./constants";
import { LudoRuleError } from "./types";
import type {
  ApplyActionResult,
  DomainEvent,
  ExtremePowerState,
  MatchAction,
  MatchState,
  TokenState,
  UltimateKind,
} from "./types";

const KNOWN_ULTIMATES = new Set<UltimateKind>(["meteor", "quake", "surge"]);

/** Per-ultimate balance: how much charge it costs to fire and how many times it
 *  may be used in a match (some are limited, some are reusable). */
export const ULTIMATE_META: Record<
  UltimateKind,
  { readonly cost: number; readonly maxUses: number }
> = {
  // Powerful, board-swinging ultimates are capped; the defensive one recharges.
  meteor: { cost: ULTIMATE_MAX, maxUses: 2 },
  quake: { cost: ULTIMATE_MAX, maxUses: 3 },
  surge: { cost: 70, maxUses: Number.POSITIVE_INFINITY },
};

/** The ultimate a player has equipped (defaults to Meteor when unset). */
export const DEFAULT_ULTIMATE: UltimateKind = "meteor";

export function equippedUltimate(
  state: MatchState,
  playerId: string,
): UltimateKind {
  return state.powerUps?.ultimateLoadout?.[playerId] ?? DEFAULT_ULTIMATE;
}

/** A player's current ultimate charge (0 when none tracked yet). */
export function chargeOf(state: MatchState, playerId: string): number {
  return state.powerUps?.ultimate?.[playerId] ?? 0;
}

/** How many times the player has already fired their ultimate this match. */
export function usesOf(state: MatchState, playerId: string): number {
  return state.powerUps?.ultimateUses?.[playerId] ?? 0;
}

/** The charge a player needs before their equipped ultimate can fire. */
export function ultimateCost(state: MatchState, playerId: string): number {
  return ULTIMATE_META[equippedUltimate(state, playerId)].cost;
}

/** Uses remaining on a player's equipped ultimate (Infinity when uncapped). */
export function ultimateUsesLeft(state: MatchState, playerId: string): number {
  const meta = ULTIMATE_META[equippedUltimate(state, playerId)];
  return meta.maxUses - usesOf(state, playerId);
}

export function isUltimateReady(state: MatchState, playerId: string): boolean {
  return (
    chargeOf(state, playerId) >= ultimateCost(state, playerId) &&
    ultimateUsesLeft(state, playerId) > 0
  );
}

/** Add charge to a player's meter, capped at the maximum. Returns a new
 *  ultimate record; pure so it stays replay-safe. */
export function addCharge(
  power: ExtremePowerState,
  playerId: string,
  amount: number,
): Readonly<Record<string, number>> {
  const ultimate = { ...(power.ultimate ?? {}) };
  const next = Math.min(ULTIMATE_MAX, (ultimate[playerId] ?? 0) + amount);
  ultimate[playerId] = next;
  return ultimate;
}

/** Give the player about to take their turn their per-turn charge. Extreme-only;
 *  returns the new power state, or the same one when not applicable. */
export function chargeIncomingPlayer(state: MatchState): ExtremePowerState | undefined {
  if (state.ruleset !== "extreme" || !state.powerUps) return state.powerUps;
  const incoming = state.players[state.activePlayerIndex];
  if (!incoming) return state.powerUps;
  return {
    ...state.powerUps,
    ultimate: addCharge(state.powerUps, incoming.id, ULTIMATE_CHARGE_PER_TURN),
  };
}

function requireReadyCaster(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-ultimate" }>,
): ExtremePowerState {
  if (state.status !== "active") {
    throw new LudoRuleError("INVALID_ACTION", "Match is not active");
  }
  const active = state.players[state.activePlayerIndex];
  if (!active || active.id !== action.playerId) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Player ${action.playerId} is not the active player`,
    );
  }
  if (state.ruleset !== "extreme" || !state.powerUps) {
    throw new LudoRuleError("INVALID_ACTION", "Ultimates are only for Extreme mode");
  }
  if (state.phase !== "awaiting-roll") {
    throw new LudoRuleError("INVALID_ACTION", "Use an ultimate before rolling");
  }
  if (!KNOWN_ULTIMATES.has(action.ultimate)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `Unknown ultimate ${action.ultimate}`,
    );
  }
  if (action.ultimate !== equippedUltimate(state, action.playerId)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "You can only use your equipped ultimate",
    );
  }
  if (ultimateUsesLeft(state, action.playerId) <= 0) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Your ultimate has no uses left",
    );
  }
  if (!isUltimateReady(state, action.playerId)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Your ultimate is not fully charged",
    );
  }
  return state.powerUps;
}

/** Spend a full ultimate charge to unleash one of three earned attacks. */
export function applyUseUltimate(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-ultimate" }>,
): ApplyActionResult {
  const power = requireReadyCaster(state, action);
  // Drain the meter and count the use regardless of which ultimate is cast.
  const drained: ExtremePowerState = {
    ...power,
    ultimate: { ...(power.ultimate ?? {}), [action.playerId]: 0 },
    ultimateUses: {
      ...(power.ultimateUses ?? {}),
      [action.playerId]: usesOf(state, action.playerId) + 1,
    },
  };
  const used: DomainEvent = {
    type: "ultimate-used",
    playerId: action.playerId,
    ultimate: action.ultimate,
  };

  switch (action.ultimate) {
    case "meteor":
      return castMeteor(state, action, drained, used);
    case "quake":
      return castQuake(state, action, drained, used);
    case "surge":
      return castSurge(state, action, drained, used);
  }
}

/** Meteor: strike one opponent token home from any range. Ignores safe squares;
 *  a shield still absorbs the blow (and is spent doing so). */
function castMeteor(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-ultimate" }>,
  drained: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  if (!action.targetTokenId) {
    throw new LudoRuleError("INVALID_ACTION", "Choose a token to strike");
  }
  const target = state.tokens.find((t) => t.id === action.targetTokenId);
  if (!target || target.playerId === action.playerId) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "That target must be an opponent's token",
    );
  }
  if (target.status !== "active" || target.progress === null) {
    throw new LudoRuleError("INVALID_ACTION", "That target is not in play");
  }
  const spec = boardSpec(state.ruleset);
  const ringIndex =
    target.progress <= spec.ringProgressMax
      ? progressToRingIndex(target.color, target.progress, spec)
      : 0;

  if (drained.shieldedTokenIds.includes(target.id)) {
    return {
      state: {
        ...state,
        powerUps: {
          ...drained,
          shieldedTokenIds: drained.shieldedTokenIds.filter(
            (id) => id !== target.id,
          ),
        },
      },
      events: [
        used,
        {
          type: "capture-blocked",
          playerId: target.playerId,
          tokenId: target.id,
          ringIndex,
        },
      ],
    };
  }
  return {
    state: {
      ...state,
      powerUps: drained,
      tokens: state.tokens.map((t) =>
        t.id === target.id
          ? { ...t, status: "yard" as const, progress: null }
          : t,
      ),
    },
    events: [
      used,
      {
        type: "token-captured",
        playerId: action.playerId,
        tokenId: target.id,
        capturedTokenId: target.id,
        ringIndex,
      },
    ],
  };
}

/** Quake: knock every opponent's ring token back, shielded tokens excepted
 *  (their shield absorbs it). A board-wide swing in your favour. */
function castQuake(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-ultimate" }>,
  drained: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  let shieldedTokenIds = drained.shieldedTokenIds;
  const ringProgressMax = boardSpec(state.ruleset).ringProgressMax;
  const events: DomainEvent[] = [used];
  const tokens = state.tokens.map((token) => {
    const exposed =
      token.playerId !== action.playerId &&
      token.status === "active" &&
      token.progress !== null &&
      token.progress <= ringProgressMax;
    if (!exposed) return token;
    if (shieldedTokenIds.includes(token.id)) {
      shieldedTokenIds = shieldedTokenIds.filter((id) => id !== token.id);
      return token;
    }
    const toProgress = Math.max(0, token.progress! - QUAKE_KNOCKBACK);
    events.push({
      type: "token-warped",
      playerId: token.playerId,
      tokenId: token.id,
      fromProgress: token.progress!,
      toProgress,
    });
    return { ...token, progress: toProgress };
  });
  return {
    state: { ...state, powerUps: { ...drained, shieldedTokenIds }, tokens },
    events,
  };
}

/** Surge: raise a shield on every one of your active tokens — a defensive
 *  ultimate that turns the tide when you are under pressure. */
function castSurge(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-ultimate" }>,
  drained: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const mine = state.tokens.filter(
    (t): t is TokenState =>
      t.playerId === action.playerId && t.status === "active",
  );
  const shieldedTokenIds = [...drained.shieldedTokenIds];
  for (const token of mine) {
    if (!shieldedTokenIds.includes(token.id)) shieldedTokenIds.push(token.id);
  }
  return {
    state: { ...state, powerUps: { ...drained, shieldedTokenIds } },
    events: [used],
  };
}
