export type PlayerColor = "red" | "green" | "yellow" | "blue";
export type Ruleset = "classic" | "nigerian";
export type MatchStatus = "lobby" | "active" | "completed";
export type TurnPhase =
  | "awaiting-roll"
  | "awaiting-die-order"
  | "awaiting-move";

export interface Die {
  id: string;
  value: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TokenState {
  id: string;
  playerId: string;
  color: PlayerColor;
  status: "yard" | "active" | "won";
  progress: number | null;
}

export interface PlayerState {
  id: string;
  color: PlayerColor;
  displayName: string;
  connected: boolean;
  forfeited: boolean;
  consecutiveTimeouts: number;
}

export interface PendingRoll {
  dice: Die[];
  remainingDieIds: string[];
  selectedDieOrder: string[] | null;
  forcedTokenId: string | null;
  startedWithAllTokensInYard: boolean;
  bonusReason: "double-six" | "home" | null;
}

export interface MatchState {
  id: string;
  ruleset: Ruleset;
  status: MatchStatus;
  version: number;
  hostPlayerId: string;
  maxPlayers: 2 | 3 | 4;
  players: PlayerState[];
  tokens: TokenState[];
  activePlayerIndex: number;
  turnNumber: number;
  rollNumber: number;
  phase: TurnPhase;
  pendingRoll: PendingRoll | null;
  winnerPlayerId: string | null;
}

export interface CreateMatchInput {
  id: string;
  ruleset: Ruleset;
  maxPlayers: 2 | 3 | 4;
  host: { id: string; displayName: string; color: PlayerColor };
}

export type MatchAction =
  | {
      type: "join-seat";
      expectedVersion: number;
      player: { id: string; displayName: string; color: PlayerColor };
    }
  | { type: "start-match"; expectedVersion: number; playerId: string }
  | {
      type: "roll-dice";
      expectedVersion: number;
      playerId: string;
      dice: Die[];
    }
  | {
      type: "select-die-order";
      expectedVersion: number;
      playerId: string;
      dieIds: string[];
    }
  | {
      type: "release-token";
      expectedVersion: number;
      playerId: string;
      tokenId: string;
      dieId: string;
    }
  | {
      type: "move-token";
      expectedVersion: number;
      playerId: string;
      tokenId: string;
      dieIds: string[];
    }
  | {
      type: "resolve-timeout";
      expectedVersion: number;
      playerId: string;
      sequence: LegalAction[];
    }
  | {
      type: "set-connection";
      expectedVersion: number;
      playerId: string;
      connected: boolean;
    }
  | { type: "forfeit-player"; expectedVersion: number; playerId: string };

export type LegalAction = MatchAction;

export type DomainEvent =
  | { type: "player-joined"; playerId: string; color: PlayerColor }
  | { type: "match-started"; playerId: string }
  | { type: "dice-rolled"; playerId: string; dice: Die[] }
  | { type: "die-order-selected"; playerId: string; dieIds: string[] }
  | {
      type: "token-released";
      playerId: string;
      tokenId: string;
      dieId: string;
      ringIndex: number;
    }
  | {
      type: "token-moved";
      playerId: string;
      tokenId: string;
      dieIds: string[];
      fromProgress: number;
      toProgress: number;
    }
  | {
      type: "token-captured";
      playerId: string;
      tokenId: string;
      capturedTokenId: string;
      ringIndex: number;
    }
  | { type: "token-entered-home"; playerId: string; tokenId: string }
  | {
      type: "token-won";
      playerId: string;
      tokenId: string;
      reason: "home" | "capture";
    }
  | {
      type: "bonus-roll-granted";
      playerId: string;
      reason: "six" | "double-six" | "home";
    }
  | { type: "turn-advanced"; fromPlayerId: string; toPlayerId: string }
  | {
      type: "turn-timed-out";
      playerId: string;
      consecutiveTimeouts: number;
    }
  | { type: "connection-changed"; playerId: string; connected: boolean }
  | { type: "player-forfeited"; playerId: string }
  | { type: "match-completed"; winnerPlayerId: string };

export interface ApplyActionResult {
  state: MatchState;
  events: DomainEvent[];
}

export interface TurnSequence {
  actions: LegalAction[];
  state: MatchState;
  events: DomainEvent[];
}

export interface ReplayEntry {
  action: MatchAction;
  events: DomainEvent[];
  stateVersion: number;
}

export class LudoRuleError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ACTION"
      | "INVALID_STATE"
      | "STALE_VERSION"
      | "REPLAY_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "LudoRuleError";
  }
}
