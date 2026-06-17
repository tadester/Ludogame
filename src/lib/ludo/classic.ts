import { progressToRingIndex } from "./board";
import {
  CLASSIC_SAFE_RING_INDEXES,
  RING_PROGRESS_MAX,
  WON_PROGRESS,
} from "./constants";
import { resolveExtremeLanding } from "./extreme";
import { sortLegalActions } from "./legal-actions";
import {
  activePlayer,
  advanceTurn,
  completeMatch,
  grantBonusRoll,
  hasWonMatch,
  playerTokens,
  requireActivePlayer,
  validateDice,
} from "./turn-flow";
import { LudoRuleError } from "./types";
import type {
  ApplyActionResult,
  Die,
  DomainEvent,
  LegalAction,
  MatchState,
  TokenState,
} from "./types";

const CLASSIC_SAFE = new Set<number>(CLASSIC_SAFE_RING_INDEXES);

function dieUses(
  state: MatchState,
  die: Die,
): { releases: TokenState[]; moves: TokenState[] } {
  const tokens = playerTokens(state, activePlayer(state).id);
  return {
    releases:
      die.value === 6 ? tokens.filter((token) => token.status === "yard") : [],
    moves: tokens.filter(
      (token) =>
        token.status === "active" &&
        token.progress !== null &&
        token.progress + die.value <= WON_PROGRESS,
    ),
  };
}

export function getClassicLegalActions(state: MatchState): LegalAction[] {
  const playerId = activePlayer(state).id;
  if (state.phase === "awaiting-roll") {
    return [
      {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId,
        dice: [],
      },
    ];
  }
  if (state.phase !== "awaiting-move" || state.pendingRoll === null) {
    return [];
  }

  const die = state.pendingRoll.dice[0];
  const { releases, moves } = dieUses(state, die);
  const actions: LegalAction[] = [
    ...releases.map<LegalAction>((token) => ({
      type: "release-token",
      expectedVersion: state.version,
      playerId,
      tokenId: token.id,
      dieId: die.id,
    })),
    ...moves.map<LegalAction>((token) => ({
      type: "move-token",
      expectedVersion: state.version,
      playerId,
      tokenId: token.id,
      dieIds: [die.id],
    })),
  ];
  return sortLegalActions(actions);
}

function applyClassicRoll(
  state: MatchState,
  action: Extract<LegalAction, { type: "roll-dice" }>,
): ApplyActionResult {
  if (state.phase !== "awaiting-roll") {
    throw new LudoRuleError("INVALID_ACTION", "A roll is not expected now");
  }
  requireActivePlayer(state, action.playerId);
  if (action.dice.length !== 1) {
    throw new LudoRuleError(
      "INVALID_ACTION",
      "Classic rolls require exactly one die",
    );
  }
  validateDice(action.dice);

  const die = action.dice[0];
  const events: DomainEvent[] = [
    { type: "dice-rolled", playerId: action.playerId, dice: action.dice },
  ];
  const rolled: MatchState = { ...state, rollNumber: state.rollNumber + 1 };
  const { releases, moves } = dieUses(rolled, die);

  if (releases.length === 0 && moves.length === 0) {
    const advanced = advanceTurn(rolled);
    return { state: advanced.state, events: [...events, ...advanced.events] };
  }

  return {
    state: {
      ...rolled,
      phase: "awaiting-move",
      pendingRoll: {
        dice: [die],
        remainingDieIds: [die.id],
        selectedDieOrder: null,
        forcedTokenId: null,
        startedWithAllTokensInYard: playerTokens(
          rolled,
          action.playerId,
        ).every((token) => token.status === "yard"),
        bonusReason: null,
      },
    },
    events,
  };
}

function captureOnRing(
  state: MatchState,
  moverId: string,
  ringIndex: number,
): { tokens: readonly TokenState[]; events: DomainEvent[] } {
  if (CLASSIC_SAFE.has(ringIndex)) {
    return { tokens: state.tokens, events: [] };
  }
  const events: DomainEvent[] = [];
  const tokens = state.tokens.map((token) => {
    const isOpposingRingToken =
      token.playerId !== moverId &&
      token.status === "active" &&
      token.progress !== null &&
      token.progress <= RING_PROGRESS_MAX &&
      progressToRingIndex(token.color, token.progress) === ringIndex;
    if (!isOpposingRingToken) {
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
  return { tokens, events };
}

function finishClassicDie(
  state: MatchState,
  die: Die,
  events: DomainEvent[],
): ApplyActionResult {
  const moverId = activePlayer(state).id;
  const resolved: MatchState = { ...state, pendingRoll: null };
  if (hasWonMatch(resolved, moverId)) {
    const completed = completeMatch(resolved, moverId);
    return {
      state: completed.state,
      events: [...events, ...completed.events],
    };
  }
  if (die.value === 6) {
    const bonus = grantBonusRoll(resolved, "six");
    return { state: bonus.state, events: [...events, ...bonus.events] };
  }
  const advanced = advanceTurn(resolved);
  return { state: advanced.state, events: [...events, ...advanced.events] };
}

function applyClassicRelease(
  state: MatchState,
  action: Extract<LegalAction, { type: "release-token" }>,
): ApplyActionResult {
  const die = state.pendingRoll!.dice[0];
  const token = state.tokens.find((entry) => entry.id === action.tokenId)!;
  const ringIndex = progressToRingIndex(token.color, 0);
  const moved: MatchState = {
    ...state,
    tokens: state.tokens.map((entry) =>
      entry.id === action.tokenId
        ? { ...entry, status: "active" as const, progress: 0 }
        : entry,
    ),
  };
  const events: DomainEvent[] = [
    {
      type: "token-released",
      playerId: action.playerId,
      tokenId: action.tokenId,
      dieId: action.dieId,
      ringIndex,
    },
  ];
  // Classic openings are safe squares, so a release never captures.
  return finishClassicDie(moved, die, events);
}

function applyClassicMove(
  state: MatchState,
  action: Extract<LegalAction, { type: "move-token" }>,
): ApplyActionResult {
  const die = state.pendingRoll!.dice[0];
  const token = state.tokens.find((entry) => entry.id === action.tokenId)!;
  const fromProgress = token.progress!;
  const toProgress = fromProgress + die.value;

  let next: MatchState = {
    ...state,
    tokens: state.tokens.map((entry) =>
      entry.id === action.tokenId
        ? {
            ...entry,
            status:
              toProgress === WON_PROGRESS
                ? ("won" as const)
                : ("active" as const),
            progress: toProgress,
          }
        : entry,
    ),
  };
  const events: DomainEvent[] = [
    {
      type: "token-moved",
      playerId: action.playerId,
      tokenId: action.tokenId,
      dieIds: action.dieIds,
      fromProgress,
      toProgress,
    },
  ];

  if (toProgress <= RING_PROGRESS_MAX) {
    const ringIndex = progressToRingIndex(token.color, toProgress);
    if (state.ruleset === "extreme") {
      const landing = resolveExtremeLanding(next, action.playerId, ringIndex);
      next = { ...next, tokens: landing.tokens, powerUps: landing.powerUps };
      events.push(...landing.events);
    } else if (state.ruleset !== "peaceful") {
      const captured = captureOnRing(next, action.playerId, ringIndex);
      next = { ...next, tokens: captured.tokens };
      events.push(...captured.events);
    }
  } else if (toProgress === WON_PROGRESS) {
    events.push(
      {
        type: "token-entered-home",
        playerId: action.playerId,
        tokenId: action.tokenId,
      },
      {
        type: "token-won",
        playerId: action.playerId,
        tokenId: action.tokenId,
        reason: "home",
      },
    );
  }

  return finishClassicDie(next, die, events);
}

export function applyClassicAction(
  state: MatchState,
  action: LegalAction,
): ApplyActionResult {
  switch (action.type) {
    case "roll-dice":
      return applyClassicRoll(state, action);
    case "release-token":
      return applyClassicRelease(state, action);
    case "move-token":
      return applyClassicMove(state, action);
    default:
      throw new LudoRuleError(
        "INVALID_ACTION",
        `Action ${action.type} is not legal in a classic match`,
      );
  }
}
