export type PlayerColor = "red" | "green" | "yellow" | "blue";
export type Ruleset =
  | "classic"
  | "nigerian"
  | "peaceful"
  | "blitz"
  | "extreme";
export type MatchStatus = "lobby" | "active" | "completed";
export type TurnPhase =
  | "awaiting-roll"
  | "awaiting-die-order"
  | "awaiting-move";

export interface Die {
  readonly id: string;
  readonly value: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TokenState {
  readonly id: string;
  readonly playerId: string;
  readonly color: PlayerColor;
  readonly status: "yard" | "active" | "won";
  readonly progress: number | null;
}

export interface PlayerState {
  readonly id: string;
  readonly color: PlayerColor;
  readonly displayName: string;
  readonly connected: boolean;
  readonly forfeited: boolean;
  readonly consecutiveTimeouts: number;
}

export interface PendingRoll {
  readonly dice: readonly Die[];
  readonly remainingDieIds: readonly string[];
  readonly selectedDieOrder: readonly string[] | null;
  readonly forcedTokenId: string | null;
  readonly startedWithAllTokensInYard: boolean;
  readonly bonusReason: "double-six" | "home" | null;
}

/** Collectible powers in Extreme mode. Kept deliberately small and fair. */
export type PowerKind = "shield" | "dash";

export interface PowerTile {
  readonly ringIndex: number;
  readonly power: PowerKind;
}

/** Extreme-mode state: power tiles still on the board, each player's collected
 *  powers, and which tokens are currently shielded from one capture. */
export interface ExtremePowerState {
  readonly tiles: readonly PowerTile[];
  readonly inventory: Readonly<Record<string, readonly PowerKind[]>>;
  readonly shieldedTokenIds: readonly string[];
  /** Tokens whose next move advances double the roll (dash power). */
  readonly dashTokenIds: readonly string[];
}

export interface MatchState {
  readonly id: string;
  readonly ruleset: Ruleset;
  readonly status: MatchStatus;
  readonly version: number;
  readonly hostPlayerId: string;
  readonly maxPlayers: 2 | 3 | 4;
  readonly players: readonly PlayerState[];
  readonly tokens: readonly TokenState[];
  readonly activePlayerIndex: number;
  readonly turnNumber: number;
  readonly rollNumber: number;
  readonly phase: TurnPhase;
  readonly pendingRoll: PendingRoll | null;
  readonly winnerPlayerId: string | null;
  /** Present only in Extreme mode. */
  readonly powerUps?: ExtremePowerState;
}

export interface CreateMatchInput {
  readonly id: string;
  readonly ruleset: Ruleset;
  readonly maxPlayers: 2 | 3 | 4;
  readonly host: {
    readonly id: string;
    readonly displayName: string;
    readonly color: PlayerColor;
  };
}

export type PlayableTurnAction =
  | {
      readonly type: "roll-dice";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly dice: readonly Die[];
    }
  | {
      readonly type: "select-die-order";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly dieIds: readonly string[];
    }
  | {
      readonly type: "release-token";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly tokenId: string;
      readonly dieId: string;
    }
  | {
      readonly type: "move-token";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly tokenId: string;
      readonly dieIds: readonly string[];
    };

export type MatchAction =
  | PlayableTurnAction
  | {
      readonly type: "join-seat";
      readonly expectedVersion: number;
      readonly player: {
        readonly id: string;
        readonly displayName: string;
        readonly color: PlayerColor;
      };
    }
  | {
      readonly type: "start-match";
      readonly expectedVersion: number;
      readonly playerId: string;
    }
  | {
      readonly type: "resolve-timeout";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly sequence: readonly PlayableTurnAction[];
    }
  | {
      readonly type: "set-connection";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly connected: boolean;
    }
  | {
      readonly type: "forfeit-player";
      readonly expectedVersion: number;
      readonly playerId: string;
    }
  | {
      readonly type: "use-power";
      readonly expectedVersion: number;
      readonly playerId: string;
      readonly power: PowerKind;
      readonly tokenId: string;
    };

export type LegalAction = MatchAction;

export type DomainEvent =
  | {
      readonly type: "player-joined";
      readonly playerId: string;
      readonly color: PlayerColor;
    }
  | { readonly type: "match-started"; readonly playerId: string }
  | {
      readonly type: "dice-rolled";
      readonly playerId: string;
      readonly dice: readonly Die[];
    }
  | {
      readonly type: "die-order-selected";
      readonly playerId: string;
      readonly dieIds: readonly string[];
    }
  | {
      readonly type: "token-released";
      readonly playerId: string;
      readonly tokenId: string;
      readonly dieId: string;
      readonly ringIndex: number;
    }
  | {
      readonly type: "token-moved";
      readonly playerId: string;
      readonly tokenId: string;
      readonly dieIds: readonly string[];
      readonly fromProgress: number;
      readonly toProgress: number;
    }
  | {
      readonly type: "token-captured";
      readonly playerId: string;
      readonly tokenId: string;
      readonly capturedTokenId: string;
      readonly ringIndex: number;
    }
  | {
      readonly type: "token-entered-home";
      readonly playerId: string;
      readonly tokenId: string;
    }
  | {
      readonly type: "token-won";
      readonly playerId: string;
      readonly tokenId: string;
      readonly reason: "home" | "capture";
    }
  | {
      readonly type: "bonus-roll-granted";
      readonly playerId: string;
      readonly reason: "six" | "double-six" | "home";
    }
  | {
      readonly type: "turn-advanced";
      readonly fromPlayerId: string;
      readonly toPlayerId: string;
    }
  | {
      readonly type: "turn-timed-out";
      readonly playerId: string;
      readonly consecutiveTimeouts: number;
    }
  | {
      readonly type: "connection-changed";
      readonly playerId: string;
      readonly connected: boolean;
    }
  | { readonly type: "player-forfeited"; readonly playerId: string }
  | { readonly type: "match-completed"; readonly winnerPlayerId: string }
  | {
      readonly type: "power-collected";
      readonly playerId: string;
      readonly power: PowerKind;
      readonly ringIndex: number;
    }
  | {
      readonly type: "power-used";
      readonly playerId: string;
      readonly power: PowerKind;
      readonly tokenId: string;
    }
  | {
      readonly type: "capture-blocked";
      readonly playerId: string;
      readonly tokenId: string;
      readonly ringIndex: number;
    }
  | { readonly type: "power-tiles-refilled" };

export interface ApplyActionResult {
  readonly state: MatchState;
  readonly events: readonly DomainEvent[];
}

export interface TurnSequence {
  readonly actions: readonly PlayableTurnAction[];
  readonly state: MatchState;
  readonly events: readonly DomainEvent[];
}

export interface ReplayEntry {
  readonly action: MatchAction;
  readonly events: readonly DomainEvent[];
  readonly stateVersion: number;
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
