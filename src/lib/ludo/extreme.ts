import { progressToRingIndex } from "./board";
import { boardSpec } from "./board-spec";
import {
  CLASSIC_SAFE_RING_INDEXES,
  POWER_INVENTORY_CAP,
  ULTIMATE_CHARGE_PER_CAPTURE,
  ULTIMATE_CHARGE_PER_POWER,
} from "./constants";
import { requireActiveMatch, requireActivePlayer, sameTeam } from "./turn-flow";
import { addCharge } from "./ultimate";
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

// Extreme runs on the larger board, so all ring maths use its spec.
const SPEC = boardSpec("extreme");
const RING_PROGRESS_MAX = SPEC.ringProgressMax;

/** The ring squares currently safe from capture. In Extreme these are random
 *  and respawn over time; otherwise they are the classic safe squares. */
function safeRingSet(state: MatchState): ReadonlySet<number> {
  const custom =
    state.ruleset === "extreme" ? state.powerUps?.safeRingIndexes : undefined;
  return custom ? new Set(custom) : CLASSIC_SAFE;
}

/** A player's equipped strategy-book loadout (empty when none is configured). */
function loadoutOf(state: MatchState, playerId: string): readonly PowerKind[] {
  return state.powerUps?.loadouts?.[playerId] ?? [];
}

/**
 * Which power a tile grants `moverId`. With a strategy-book loadout the tile
 * yields a power drawn from it; the draw is a deterministic function of the
 * match position (turn, roll, square) so replays stay identical. Without a
 * loadout the tile keeps its own power.
 */
function pickPowerForTile(
  state: MatchState,
  moverId: string,
  ringIndex: number,
  tilePower: PowerKind,
): PowerKind {
  const loadout = loadoutOf(state, moverId);
  if (loadout.length === 0) return tilePower;
  const seed = state.turnNumber * 31 + state.rollNumber * 17 + ringIndex;
  return loadout[((seed % loadout.length) + loadout.length) % loadout.length];
}

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
  let chargeGain = 0;
  const safe = safeRingSet(state);

  if (!safe.has(ringIndex)) {
    tokens = tokens.map((token) => {
      const opposing =
        !sameTeam(state, token.playerId, moverId) &&
        token.status === "active" &&
        token.progress !== null &&
        token.progress <= RING_PROGRESS_MAX &&
        progressToRingIndex(token.color, token.progress, SPEC) === ringIndex;
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
      chargeGain += ULTIMATE_CHARGE_PER_CAPTURE;
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
      const granted = pickPowerForTile(state, moverId, ringIndex, tile.power);
      tiles = tiles.filter((entry) => entry.ringIndex !== ringIndex);
      inventory = { ...inventory, [moverId]: [...held, granted] };
      chargeGain += ULTIMATE_CHARGE_PER_POWER;
      events.push({
        type: "power-collected",
        playerId: moverId,
        power: granted,
        ringIndex,
      });
    }
  }

  const withCounts: ExtremePowerState = {
    ...power,
    tiles,
    inventory,
    shieldedTokenIds,
  };
  const ultimate =
    chargeGain > 0 ? addCharge(withCounts, moverId, chargeGain) : power.ultimate;

  return {
    tokens,
    powerUps: { ...withCounts, ultimate },
    events,
  };
}

/** Tokens the given player has armed with dash (their next move is doubled). */
export function dashTokensOf(state: MatchState): readonly string[] {
  return state.powerUps?.dashTokenIds ?? [];
}

function wonCount(state: MatchState, playerId: string): number {
  return state.tokens.filter(
    (entry) => entry.playerId === playerId && entry.status === "won",
  ).length;
}

/** True when some opponent of `playerId` holds a significant lead — at least
 *  two tokens already home. Last Stand only kicks in against such a lead. */
function opponentHasBigLead(state: MatchState, playerId: string): boolean {
  return state.players.some(
    (player) => player.id !== playerId && wonCount(state, player.id) >= 2,
  );
}

/**
 * Last Stand: in Extreme, a player down to a single piece on the board with
 * none home yet — and facing an opponent with a significant lead — fights
 * harder, so that lone token's moves advance double. A fair comeback boost.
 */
export function isLastStandToken(state: MatchState, tokenId: string): boolean {
  if (state.ruleset !== "extreme") return false;
  const token = state.tokens.find((entry) => entry.id === tokenId);
  if (!token || token.status !== "active") return false;
  return isLastStandActive(state, token.playerId);
}

/** Whether the given player currently benefits from the Last Stand boost. */
export function isLastStandActive(state: MatchState, playerId: string): boolean {
  if (state.ruleset !== "extreme") return false;
  const mine = state.tokens.filter((entry) => entry.playerId === playerId);
  const active = mine.filter((entry) => entry.status === "active").length;
  const won = mine.filter((entry) => entry.status === "won").length;
  return active === 1 && won === 0 && opponentHasBigLead(state, playerId);
}

const KNOWN_POWERS = new Set<PowerKind>([
  "shield",
  "dash",
  "warp",
  "snipe",
  "swap",
  "summon",
  "bolt",
]);

/** How far a Bolt knocks an opponent token back. */
const BOLT_KNOCKBACK = 6;

/** The progress of the next safe ring square strictly ahead of `progress` for
 *  a token of `color`, or null when none lies ahead before the home lane. */
function nextSafeProgressAhead(
  color: TokenState["color"],
  progress: number,
  safe: ReadonlySet<number>,
): number | null {
  for (let p = progress + 1; p <= RING_PROGRESS_MAX; p += 1) {
    if (safe.has(progressToRingIndex(color, p, SPEC))) return p;
  }
  return null;
}

function requireOwnActiveToken(
  state: MatchState,
  playerId: string,
  tokenId: string,
): TokenState {
  const token = state.tokens.find((entry) => entry.id === tokenId);
  if (!token || token.playerId !== playerId) {
    throw new LudoRuleError("INVALID_ACTION", "That is not your token");
  }
  if (token.status !== "active") {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Powers can only target active tokens",
    );
  }
  return token;
}

function requireOpponentActiveToken(
  state: MatchState,
  playerId: string,
  tokenId: string | undefined,
): TokenState {
  if (!tokenId) {
    throw new LudoRuleError("INVALID_ACTION", "Choose an opponent's token");
  }
  const token = state.tokens.find((entry) => entry.id === tokenId);
  if (!token || token.playerId === playerId) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "That target must be an opponent's token",
    );
  }
  if (token.status !== "active" || token.progress === null) {
    throw new LudoRuleError("INVALID_ACTION", "That target is not in play");
  }
  return token;
}

/** Spend a held power on your turn, before you roll. Shield and dash arm a
 *  token for the upcoming move; warp, snipe and swap take effect immediately. */
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
  if (!KNOWN_POWERS.has(action.power)) {
    throw new LudoRuleError("INVALID_ACTION", `Unknown power ${action.power}`);
  }

  const held = powersOf(state, action.playerId);
  const index = held.indexOf(action.power);
  if (index === -1) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `You have no ${action.power} to use`,
    );
  }

  const remaining = [...held.slice(0, index), ...held.slice(index + 1)];
  const spent: ExtremePowerState = {
    ...state.powerUps,
    inventory: { ...state.powerUps.inventory, [action.playerId]: remaining },
  };
  const used: DomainEvent = {
    type: "power-used",
    playerId: action.playerId,
    power: action.power,
    tokenId: action.tokenId,
  };

  switch (action.power) {
    case "shield":
    case "dash":
      return armToken(state, action, spent, used);
    case "warp":
      return applyWarp(state, action, spent, used);
    case "snipe":
      return applySnipe(state, action, spent, used);
    case "swap":
      return applySwap(state, action, spent, used);
    case "summon":
      return applySummon(state, action, spent, used);
    case "bolt":
      return applyBolt(state, action, spent, used);
  }
}

function armToken(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
  spent: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const token = requireOwnActiveToken(state, action.playerId, action.tokenId);
  const list =
    action.power === "shield" ? spent.shieldedTokenIds : spent.dashTokenIds;
  if (list.includes(token.id)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      `That token already has ${action.power}`,
    );
  }
  const powerUps: ExtremePowerState = {
    ...spent,
    shieldedTokenIds:
      action.power === "shield"
        ? [...spent.shieldedTokenIds, token.id]
        : spent.shieldedTokenIds,
    dashTokenIds:
      action.power === "dash"
        ? [...spent.dashTokenIds, token.id]
        : spent.dashTokenIds,
  };
  return { state: { ...state, powerUps }, events: [used] };
}

/** Warp: jump one of your active tokens forward to the next safe square. */
function applyWarp(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
  spent: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const token = requireOwnActiveToken(state, action.playerId, action.tokenId);
  if (token.progress === null || token.progress > RING_PROGRESS_MAX) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "That token is too close to home to warp",
    );
  }
  const toProgress = nextSafeProgressAhead(
    token.color,
    token.progress,
    safeRingSet(state),
  );
  if (toProgress === null) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "No safe square ahead to warp to",
    );
  }
  const fromProgress = token.progress;
  return {
    state: {
      ...state,
      powerUps: spent,
      tokens: state.tokens.map((entry) =>
        entry.id === token.id ? { ...entry, progress: toProgress } : entry,
      ),
    },
    events: [
      used,
      {
        type: "token-warped",
        playerId: action.playerId,
        tokenId: token.id,
        fromProgress,
        toProgress,
      },
    ],
  };
}

/** Snipe: send an opponent's active token back to its yard from range. Safe
 *  squares block it, and a shield absorbs it (and is spent doing so). */
function applySnipe(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
  spent: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const target = requireOpponentActiveToken(
    state,
    action.playerId,
    action.targetTokenId,
  );
  const ringIndex =
    target.progress! <= RING_PROGRESS_MAX
      ? progressToRingIndex(target.color, target.progress!, SPEC)
      : -1;
  if (ringIndex !== -1 && safeRingSet(state).has(ringIndex)) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "That token is on a safe square",
    );
  }
  if (spent.shieldedTokenIds.includes(target.id)) {
    return {
      state: {
        ...state,
        powerUps: {
          ...spent,
          shieldedTokenIds: spent.shieldedTokenIds.filter(
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
          ringIndex: ringIndex === -1 ? 0 : ringIndex,
        },
      ],
    };
  }
  return {
    state: {
      ...state,
      powerUps: {
        ...spent,
        ultimate: addCharge(spent, action.playerId, ULTIMATE_CHARGE_PER_CAPTURE),
      },
      tokens: state.tokens.map((entry) =>
        entry.id === target.id
          ? { ...entry, status: "yard" as const, progress: null }
          : entry,
      ),
    },
    events: [
      used,
      {
        type: "token-captured",
        playerId: action.playerId,
        tokenId: target.id,
        capturedTokenId: target.id,
        ringIndex: ringIndex === -1 ? 0 : ringIndex,
      },
    ],
  };
}

/** Summon: release one of your tokens from the yard to its starting square
 *  without needing to roll a six. */
function applySummon(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
  spent: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const token = state.tokens.find((entry) => entry.id === action.tokenId);
  if (!token || token.playerId !== action.playerId) {
    throw new LudoRuleError("INVALID_ACTION", "That is not your token");
  }
  if (token.status !== "yard") {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Summon only releases a token from the yard",
    );
  }
  const ringIndex = progressToRingIndex(token.color, 0, SPEC);
  return {
    state: {
      ...state,
      powerUps: spent,
      tokens: state.tokens.map((entry) =>
        entry.id === token.id
          ? { ...entry, status: "active" as const, progress: 0 }
          : entry,
      ),
    },
    events: [
      used,
      {
        type: "token-released",
        playerId: action.playerId,
        tokenId: token.id,
        dieId: "summon",
        ringIndex,
      },
    ],
  };
}

/** Bolt: knock an exposed opponent token back a few squares (not all the way
 *  home). Safe squares block it and a shield absorbs it. A gentler snipe. */
function applyBolt(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
  spent: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const target = requireOpponentActiveToken(
    state,
    action.playerId,
    action.targetTokenId,
  );
  if (
    target.progress! <= RING_PROGRESS_MAX &&
    safeRingSet(state).has(progressToRingIndex(target.color, target.progress!, SPEC))
  ) {
    throw new LudoRuleError("INVALID_ACTION", "That token is on a safe square");
  }
  if (spent.shieldedTokenIds.includes(target.id)) {
    return {
      state: {
        ...state,
        powerUps: {
          ...spent,
          shieldedTokenIds: spent.shieldedTokenIds.filter(
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
          ringIndex: progressToRingIndex(
            target.color,
            Math.min(target.progress!, RING_PROGRESS_MAX),
            SPEC,
          ),
        },
      ],
    };
  }
  const fromProgress = target.progress!;
  const toProgress = Math.max(0, fromProgress - BOLT_KNOCKBACK);
  return {
    state: {
      ...state,
      powerUps: spent,
      tokens: state.tokens.map((entry) =>
        entry.id === target.id ? { ...entry, progress: toProgress } : entry,
      ),
    },
    events: [
      used,
      {
        type: "token-warped",
        playerId: target.playerId,
        tokenId: target.id,
        fromProgress,
        toProgress,
      },
    ],
  };
}

/** Swap: exchange the board position of one of your active tokens with an
 *  opponent's active token. */
function applySwap(
  state: MatchState,
  action: Extract<MatchAction, { type: "use-power" }>,
  spent: ExtremePowerState,
  used: DomainEvent,
): ApplyActionResult {
  const mine = requireOwnActiveToken(state, action.playerId, action.tokenId);
  const target = requireOpponentActiveToken(
    state,
    action.playerId,
    action.targetTokenId,
  );
  return {
    state: {
      ...state,
      powerUps: spent,
      tokens: state.tokens.map((entry) => {
        if (entry.id === mine.id) return { ...entry, progress: target.progress };
        if (entry.id === target.id) return { ...entry, progress: mine.progress };
        return entry;
      }),
    },
    events: [
      used,
      {
        type: "tokens-swapped",
        playerId: action.playerId,
        tokenId: mine.id,
        targetTokenId: target.id,
      },
    ],
  };
}
