# Deterministic Ludo Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, framework-independent TypeScript rules engine that deterministically executes, enumerates, validates, and replays complete Classic and Nigerian Ludo matches.

**Architecture:** Keep the engine under `src/lib/ludo` with immutable JSON-safe state, discriminated action/event unions, ruleset-specific legal-action generators, and one transition boundary. Represent board movement as color-relative progress (`0..51` shared ring, `52..56` private home lane, exact `57` won), convert ring progress to shared indexes only for collisions, and retain server-supplied stable die IDs through every action and event. Keep randomness, React, Next.js, Supabase, persistence, and clocks outside the module.

**Tech Stack:** TypeScript 5, Vitest 4, fast-check, Node.js 20+, npm

---

## File Map

- `package.json`: add the property-testing dependency without adding runtime engine dependencies.
- `package-lock.json`: lock the installed `fast-check` version.
- `src/lib/ludo/types.ts`: JSON-safe public state, action, event, result, and error contracts.
- `src/lib/ludo/constants.ts`: player order, opening indexes, Classic safe indexes, and progress bounds.
- `src/lib/ludo/board.ts`: color-relative progress and shared-ring coordinate conversion.
- `src/lib/ludo/create-match.ts`: deterministic lobby creation and token/player initialization.
- `src/lib/ludo/legal-actions.ts`: public legal-action dispatcher and common action ordering.
- `src/lib/ludo/classic.ts`: Classic roll, release, movement, capture, home, bonus-roll, and win rules.
- `src/lib/ludo/nigerian.ts`: Nigerian two-die obligations, order selection, combined movement, capture, home, bonus, and opening protection rules.
- `src/lib/ludo/apply-action.ts`: immutable transition boundary, stale-version checks, and lifecycle actions.
- `src/lib/ludo/turn-sequences.ts`: exhaustive complete legal-turn sequence enumeration.
- `src/lib/ludo/replay.ts`: deterministic event-log replay through validated actions.
- `src/lib/ludo/invariants.ts`: structural and semantic match-state assertions.
- `src/lib/ludo/index.ts`: the only supported public import surface.
- `src/lib/ludo/test/builders.ts`: typed test fixtures for precise board states.
- `src/lib/ludo/board.test.ts`: topology, opening, safe-space, and exact-home coordinate tests.
- `src/lib/ludo/create-match.test.ts`: lobby and initial-state contract tests.
- `src/lib/ludo/classic.test.ts`: every approved Classic gameplay rule and edge case.
- `src/lib/ludo/nigerian-dice.test.ts`: every Nigerian die-use, die-order, release, and combined-move rule.
- `src/lib/ludo/nigerian-capture-home.test.ts`: every Nigerian capture, protected-opening, home, bonus-roll, and win rule.
- `src/lib/ludo/lifecycle.test.ts`: join, start, stale action, timeout, disconnect, reconnect, and forfeit behavior.
- `src/lib/ludo/turn-sequences.test.ts`: complete legal-turn sequence enumeration and deterministic ordering.
- `src/lib/ludo/replay.test.ts`: action/event replay and tamper rejection.
- `src/lib/ludo/invariants.test.ts`: direct invariant failures and fast-check state-machine properties.

## Public Contract

The implementation must export exactly these public functions from
`src/lib/ludo/index.ts`:

```ts
export { createMatch } from "./create-match";
export { getLegalActions } from "./legal-actions";
export { applyAction } from "./apply-action";
export { enumerateLegalTurnSequences } from "./turn-sequences";
export { replayMatch } from "./replay";
export { assertMatchInvariants } from "./invariants";
export type {
  ApplyActionResult,
  CreateMatchInput,
  Die,
  DomainEvent,
  LegalAction,
  MatchAction,
  MatchState,
  ReplayEntry,
  Ruleset,
  TurnSequence,
} from "./types";
```

No file in `src/lib/ludo` may import from `react`, `next`, `@supabase/*`,
browser globals, or application routes.

### Task 1: Install fast-check And Pin The Engine Test Boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install fast-check as a development dependency**

Run:

```bash
npm install --save-dev fast-check
```

Expected: `fast-check` appears in `devDependencies` and npm updates
`package-lock.json`.

- [ ] **Step 2: Verify the existing repository before engine work**

Run:

```bash
npm run lint
npm run typecheck
npm test
```

Expected: all existing checks pass.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "test: add property testing dependency"
```

### Task 2: Define Serializable Engine Contracts And Board Topology

**Files:**
- Create: `src/lib/ludo/types.ts`
- Create: `src/lib/ludo/constants.ts`
- Create: `src/lib/ludo/board.ts`
- Create: `src/lib/ludo/board.test.ts`

- [ ] **Step 1: Write failing topology tests**

Create `src/lib/ludo/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  CLASSIC_SAFE_RING_INDEXES,
  OPENING_RING_INDEX,
  progressToRingIndex,
} from "@/lib/ludo";

describe("Ludo board topology", () => {
  it("uses the approved opening and Classic safe indexes", () => {
    expect(OPENING_RING_INDEX).toEqual({
      red: 0,
      green: 13,
      yellow: 26,
      blue: 39,
    });
    expect(CLASSIC_SAFE_RING_INDEXES).toEqual([
      0, 8, 13, 21, 26, 34, 39, 47,
    ]);
  });

  it.each([
    ["red", 0, 0],
    ["red", 51, 51],
    ["green", 0, 13],
    ["green", 39, 0],
    ["yellow", 26, 0],
    ["blue", 13, 0],
  ] as const)(
    "maps %s progress %i to shared ring index %i",
    (color, progress, ringIndex) => {
      expect(progressToRingIndex(color, progress)).toBe(ringIndex);
    },
  );

  it.each([52, 53, 54, 55, 56, 57])(
    "rejects non-ring progress %i",
    (progress) => {
      expect(() => progressToRingIndex("red", progress)).toThrow(
        "Progress 0 through 51 is required for the shared ring",
      );
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/lib/ludo/board.test.ts
```

Expected: FAIL because `@/lib/ludo` does not exist.

- [ ] **Step 3: Define the exact public state and action contracts**

Create `src/lib/ludo/types.ts` with these discriminated unions and no
`Date`, `Map`, `Set`, class instances, functions, or `undefined` fields:

```ts
export type PlayerColor = "red" | "green" | "yellow" | "blue";
export type Ruleset = "classic" | "nigerian";
export type MatchStatus = "lobby" | "active" | "completed";
export type TurnPhase = "awaiting-roll" | "awaiting-die-order" | "awaiting-move";

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
  | { type: "token-won"; playerId: string; tokenId: string; reason: "home" | "capture" }
  | { type: "bonus-roll-granted"; playerId: string; reason: "six" | "double-six" | "home" }
  | { type: "turn-advanced"; fromPlayerId: string; toPlayerId: string }
  | { type: "turn-timed-out"; playerId: string; consecutiveTimeouts: number }
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
```

- [ ] **Step 4: Implement constants and coordinate conversion**

Create `src/lib/ludo/constants.ts`:

```ts
import type { PlayerColor } from "./types";

export const PLAYER_COLORS: readonly PlayerColor[] = [
  "red",
  "green",
  "yellow",
  "blue",
];

export const OPENING_RING_INDEX: Readonly<Record<PlayerColor, number>> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const CLASSIC_SAFE_RING_INDEXES = [
  0, 8, 13, 21, 26, 34, 39, 47,
] as const;

export const RING_PROGRESS_MAX = 51;
export const HOME_LANE_PROGRESS_MIN = 52;
export const HOME_LANE_PROGRESS_MAX = 56;
export const WON_PROGRESS = 57;
export const TOKENS_PER_PLAYER = 4;
```

Create `src/lib/ludo/board.ts`:

```ts
import { OPENING_RING_INDEX, RING_PROGRESS_MAX } from "./constants";
import type { PlayerColor } from "./types";

export function progressToRingIndex(
  color: PlayerColor,
  progress: number,
): number {
  if (!Number.isInteger(progress) || progress < 0 || progress > RING_PROGRESS_MAX) {
    throw new Error("Progress 0 through 51 is required for the shared ring");
  }

  return (OPENING_RING_INDEX[color] + progress) % 52;
}
```

- [ ] **Step 5: Add the temporary public barrel exports**

Create `src/lib/ludo/index.ts` exporting `progressToRingIndex`,
`CLASSIC_SAFE_RING_INDEXES`, `OPENING_RING_INDEX`, and all types. Later tasks
replace this temporary barrel with the complete public contract shown above.

- [ ] **Step 6: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/board.test.ts
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ludo/types.ts src/lib/ludo/constants.ts src/lib/ludo/board.ts src/lib/ludo/board.test.ts src/lib/ludo/index.ts
git commit -m "feat: define ludo engine contracts and topology"
```

### Task 3: Create Matches, Join Seats, And Start Deterministically

**Files:**
- Create: `src/lib/ludo/create-match.ts`
- Create: `src/lib/ludo/create-match.test.ts`
- Create: `src/lib/ludo/test/builders.ts`
- Create: `src/lib/ludo/apply-action.ts`
- Create: `src/lib/ludo/legal-actions.ts`
- Modify: `src/lib/ludo/index.ts`

- [ ] **Step 1: Write failing creation and lobby tests**

Create `src/lib/ludo/create-match.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyAction, createMatch, getLegalActions } from "@/lib/ludo";

describe("createMatch", () => {
  it("creates four stable yard tokens for the host", () => {
    const state = createMatch({
      id: "match-1",
      ruleset: "classic",
      maxPlayers: 2,
      host: { id: "p1", displayName: "Ada", color: "red" },
    });

    expect(state).toMatchObject({
      id: "match-1",
      status: "lobby",
      version: 0,
      hostPlayerId: "p1",
      activePlayerIndex: 0,
      turnNumber: 0,
      rollNumber: 0,
      phase: "awaiting-roll",
      pendingRoll: null,
      winnerPlayerId: null,
    });
    expect(state.tokens.map((token) => token.id)).toEqual([
      "p1-token-1",
      "p1-token-2",
      "p1-token-3",
      "p1-token-4",
    ]);
    expect(state.tokens.every((token) => token.status === "yard")).toBe(true);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("offers only unused colors and lets the host start a full lobby", () => {
    let state = createMatch({
      id: "match-2",
      ruleset: "nigerian",
      maxPlayers: 2,
      host: { id: "p1", displayName: "Ada", color: "red" },
    });

    expect(getLegalActions(state)).toContainEqual({
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "", displayName: "", color: "green" },
    });

    state = applyAction(state, {
      type: "join-seat",
      expectedVersion: 0,
      player: { id: "p2", displayName: "Ben", color: "green" },
    }).state;
    const started = applyAction(state, {
      type: "start-match",
      expectedVersion: 1,
      playerId: "p1",
    });

    expect(started.state.status).toBe("active");
    expect(started.state.version).toBe(2);
    expect(started.events).toEqual([{ type: "match-started", playerId: "p1" }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/lib/ludo/create-match.test.ts
```

Expected: FAIL because `createMatch`, `getLegalActions`, and `applyAction` are
not exported.

- [ ] **Step 3: Implement deterministic match construction**

Create `src/lib/ludo/create-match.ts` with:

```ts
import { TOKENS_PER_PLAYER } from "./constants";
import type { CreateMatchInput, MatchState, PlayerState, TokenState } from "./types";

export function createPlayer(
  id: string,
  displayName: string,
  color: PlayerState["color"],
): PlayerState {
  return {
    id,
    color,
    displayName,
    connected: true,
    forfeited: false,
    consecutiveTimeouts: 0,
  };
}

export function createTokens(player: PlayerState): TokenState[] {
  return Array.from({ length: TOKENS_PER_PLAYER }, (_, index) => ({
    id: `${player.id}-token-${index + 1}`,
    playerId: player.id,
    color: player.color,
    status: "yard" as const,
    progress: null,
  }));
}

export function createMatch(input: CreateMatchInput): MatchState {
  const host = createPlayer(
    input.host.id,
    input.host.displayName,
    input.host.color,
  );

  return {
    id: input.id,
    ruleset: input.ruleset,
    status: "lobby",
    version: 0,
    hostPlayerId: host.id,
    maxPlayers: input.maxPlayers,
    players: [host],
    tokens: createTokens(host),
    activePlayerIndex: 0,
    turnNumber: 0,
    rollNumber: 0,
    phase: "awaiting-roll",
    pendingRoll: null,
    winnerPlayerId: null,
  };
}
```

Reject invalid lobby actions with these exact errors:

```ts
throw new LudoRuleError("INVALID_ACTION", "Player ID is required");
throw new LudoRuleError("INVALID_ACTION", "Display name is required");
throw new LudoRuleError("INVALID_ACTION", `Player ${playerId} already joined`);
throw new LudoRuleError("INVALID_ACTION", `Color ${color} is already occupied`);
throw new LudoRuleError("INVALID_ACTION", "Match lobby is full");
throw new LudoRuleError("INVALID_ACTION", "Only the host can start the match");
throw new LudoRuleError(
  "INVALID_ACTION",
  `Match requires ${state.maxPlayers} players before starting`,
);
```

- [ ] **Step 4: Implement the initial legal-action and transition boundaries**

Create `src/lib/ludo/legal-actions.ts` so lobby states return:

- one `join-seat` template per unused color while seats remain
- one `start-match` action only when the lobby is full
- actions sorted by `type`, then color, then player/token/die IDs

Create `src/lib/ludo/apply-action.ts` so it:

- rejects `action.expectedVersion !== state.version` with
  `LudoRuleError("STALE_VERSION", "Expected version X but received Y")`
- clones only changed arrays/objects and never mutates the input
- increments `version` exactly once for every accepted public action
- adds four stable token IDs for a joined player
- starts with player index `0`, `turnNumber: 1`, and `phase: "awaiting-roll"`
- rejects any action not equal to one returned by `getLegalActions`, except
  concrete `join-seat`, `set-connection`, `forfeit-player`, and
  `resolve-timeout` values are validated by their dedicated system-action
  guards

- [ ] **Step 5: Add reusable typed fixture builders**

Create `src/lib/ludo/test/builders.ts` exporting:

```ts
import { applyAction, createMatch } from "@/lib/ludo";
import type { MatchState, PlayerColor, Ruleset } from "@/lib/ludo";

export function startedMatch(ruleset: Ruleset = "classic"): MatchState {
  let state = createMatch({
    id: `${ruleset}-match`,
    ruleset,
    maxPlayers: 2,
    host: { id: "p1", displayName: "Ada", color: "red" },
  });
  state = applyAction(state, {
    type: "join-seat",
    expectedVersion: state.version,
    player: { id: "p2", displayName: "Ben", color: "green" },
  }).state;
  return applyAction(state, {
    type: "start-match",
    expectedVersion: state.version,
    playerId: "p1",
  }).state;
}

export function withToken(
  state: MatchState,
  tokenId: string,
  progress: number | null,
): MatchState {
  return {
    ...state,
    tokens: state.tokens.map((token) =>
      token.id === tokenId
        ? {
            ...token,
            status: progress === null ? "yard" : progress === 57 ? "won" : "active",
            progress,
          }
        : token,
    ),
  };
}

export function playerIdForColor(
  state: MatchState,
  color: PlayerColor,
): string {
  const player = state.players.find((candidate) => candidate.color === color);
  if (!player) throw new Error(`No ${color} player`);
  return player.id;
}
```

- [ ] **Step 6: Export the public APIs and run verification**

Update `src/lib/ludo/index.ts` to export the complete public contract plus the
board constants needed by tests.

Run:

```bash
npm test -- src/lib/ludo/create-match.test.ts src/lib/ludo/board.test.ts
npm run lint
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ludo
git commit -m "feat: add deterministic match lifecycle"
```

### Task 4: Implement Classic Rolling, Release, And Mandatory Turn Flow

**Files:**
- Create: `src/lib/ludo/classic.ts`
- Create: `src/lib/ludo/classic.test.ts`
- Modify: `src/lib/ludo/legal-actions.ts`
- Modify: `src/lib/ludo/apply-action.ts`

- [ ] **Step 1: Write failing Classic roll and release tests**

Create the first section of `src/lib/ludo/classic.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("Classic rolling and release", () => {
  it("requires exactly one stable-ID die", () => {
    const state = startedMatch("classic");

    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [
          { id: "die-a", value: 3 },
          { id: "die-b", value: 4 },
        ],
      }),
    ).toThrow("Classic rolls require exactly one die");
  });

  it("ends the turn when every token is in the yard and the die is not six", () => {
    const state = startedMatch("classic");
    const result = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "turn-1-roll-1-die-1", value: 5 }],
    });

    expect(result.state.players[result.state.activePlayerIndex].id).toBe("p2");
    expect(result.state.phase).toBe("awaiting-roll");
    expect(result.state.pendingRoll).toBeNull();
  });

  it("offers a release for each yard token on six and preserves the die ID", () => {
    const state = startedMatch("classic");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "stable-six", value: 6 }],
    }).state;

    expect(getLegalActions(rolled)).toContainEqual({
      type: "release-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "stable-six",
    });

    const released = applyAction(rolled, {
      type: "release-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "stable-six",
    });
    expect(released.state.tokens.find((token) => token.id === "p1-token-1"))
      .toMatchObject({ status: "active", progress: 0 });
    expect(released.state.phase).toBe("awaiting-roll");
    expect(released.events).toContainEqual({
      type: "bonus-roll-granted",
      playerId: "p1",
      reason: "six",
    });
  });

  it("allows a six to move an active token instead of releasing", () => {
    const state = withToken(startedMatch("classic"), "p1-token-1", 7);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "six", value: 6 }],
    }).state;

    expect(getLegalActions(rolled)).toContainEqual({
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["six"],
    });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/classic.test.ts
```

Expected: FAIL because Classic roll actions are not implemented.

- [ ] **Step 3: Implement Classic action generation**

Create `src/lib/ludo/classic.ts` with pure helpers:

```ts
export function getClassicLegalActions(state: MatchState): LegalAction[];
export function applyClassicAction(
  state: MatchState,
  action: LegalAction,
): ApplyActionResult;
```

Implement these exact rules:

- active turns accept one die with a non-empty ID unique within the pending roll
- only the active player can roll or move
- a six can release any yard token and can move any active token that does not
  overshoot progress `57`
- values `1..5` can move only active tokens without overshooting `57`
- if no move is legal, rolling immediately advances the turn
- resolving a six clears the pending roll and returns the same player to
  `awaiting-roll`
- resolving any other die advances to the next non-forfeited player
- action generation is stable by action type, token ID, then die ID

- [ ] **Step 4: Route Classic actions through the public boundaries**

Update `getLegalActions` and `applyAction` to dispatch active Classic states to
the two helpers. Store the exact die object in `pendingRoll.dice`; movement
looks up values by `dieId` and never accepts a client-supplied numeric distance.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/classic.test.ts
npm run typecheck
```

Expected: the Classic roll/release tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/classic.ts src/lib/ludo/classic.test.ts src/lib/ludo/legal-actions.ts src/lib/ludo/apply-action.ts
git commit -m "feat: add Classic roll and release rules"
```

### Task 5: Complete Classic Movement, Safe Captures, Exact Home, And Victory

**Files:**
- Modify: `src/lib/ludo/classic.ts`
- Modify: `src/lib/ludo/classic.test.ts`
- Modify: `src/lib/ludo/apply-action.ts`

- [ ] **Step 1: Add failing Classic movement and capture examples**

Append to `src/lib/ludo/classic.test.ts`:

```ts
describe("Classic movement and captures", () => {
  it("captures every opposing token on a non-safe destination", () => {
    let state = withToken(startedMatch("classic"), "p1-token-1", 4);
    state = withToken(state, "p2-token-1", 43); // green progress 43 -> ring 4
    state = withToken(state, "p2-token-2", 43);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "move-3", value: 3 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["move-3"],
    });

    expect(result.state.tokens.filter((token) => token.id.startsWith("p2-token-")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "p2-token-1", status: "yard", progress: null }),
        expect.objectContaining({ id: "p2-token-2", status: "yard", progress: null }),
      ]));
    expect(result.events.filter((event) => event.type === "token-captured"))
      .toHaveLength(2);
  });

  it.each([8, 13, 21, 26, 34, 39, 47])(
    "does not capture on Classic safe ring index %i",
    (safeIndex) => {
      let state = withToken(startedMatch("classic"), "p1-token-1", safeIndex - 1 < 0 ? 51 : safeIndex - 1);
      const greenProgress = (safeIndex - 13 + 52) % 52;
      state = withToken(state, "p2-token-1", greenProgress);
      const rolled = applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [{ id: `safe-${safeIndex}`, value: 1 }],
      }).state;
      const result = applyAction(rolled, {
        type: "move-token",
        expectedVersion: rolled.version,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieIds: [`safe-${safeIndex}`],
      });

      expect(result.state.tokens.find((token) => token.id === "p2-token-1"))
        .toMatchObject({ status: "active", progress: greenProgress });
    },
  );

  it("does not capture when releasing onto the red Classic safe opening", () => {
    let state = startedMatch("classic");
    state = withToken(state, "p2-token-1", 39); // green progress 39 -> ring 0
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "release-six", value: 6 }],
    }).state;
    const result = applyAction(rolled, {
      type: "release-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "release-six",
    });

    expect(result.state.tokens.find((token) => token.id === "p2-token-1"))
      .toMatchObject({ status: "active", progress: 39 });
  });

  it("allows same-color tokens to share a square", () => {
    let state = withToken(startedMatch("classic"), "p1-token-1", 9);
    state = withToken(state, "p1-token-2", 10);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "share", value: 1 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["share"],
    });

    expect(result.state.tokens.filter((token) => token.progress === 10)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Add failing exact-home and win examples**

Append:

```ts
describe("Classic home and victory", () => {
  it("moves through the private home lane and requires exact 57", () => {
    let state = withToken(startedMatch("classic"), "p1-token-1", 51);
    let rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "lane-5", value: 5 }],
    }).state;
    state = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["lane-5"],
    }).state;
    expect(state.tokens.find((token) => token.id === "p1-token-1"))
      .toMatchObject({ status: "active", progress: 56 });

    rolled = applyAction({ ...state, activePlayerIndex: 0 }, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "overshoot-2", value: 2 }],
    }).state;
    expect(getLegalActions(rolled)).not.toContainEqual(
      expect.objectContaining({ tokenId: "p1-token-1" }),
    );
  });

  it("marks exact progress 57 won and completes after all four tokens win", () => {
    let state = startedMatch("classic");
    for (const tokenId of ["p1-token-1", "p1-token-2", "p1-token-3"]) {
      state = withToken(state, tokenId, 57);
    }
    state = withToken(state, "p1-token-4", 56);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "winning-one", value: 1 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-4",
      dieIds: ["winning-one"],
    });

    expect(result.state).toMatchObject({
      status: "completed",
      winnerPlayerId: "p1",
      pendingRoll: null,
    });
    expect(result.events).toContainEqual({
      type: "match-completed",
      winnerPlayerId: "p1",
    });
  });
});
```

- [ ] **Step 3: Run the new tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/classic.test.ts
```

Expected: FAIL on capture, safe-space, or home assertions.

- [ ] **Step 4: Implement the remaining Classic rules**

In `classic.ts`:

- convert destination progress `0..51` with `progressToRingIndex`
- never collision-check home-lane progress `52..56`
- on a non-safe shared destination, return every opposing token there to
  `{ status: "yard", progress: null }`
- on a Classic safe index, leave opposing tokens unchanged
- permit same-color stacking without blocking
- emit `token-moved`, one `token-captured` per captured token, and
  `token-entered-home` plus `token-won(reason: "home")` at exact `57`
- set `status: "completed"` and emit `match-completed` immediately when all
  four tokens belonging to the mover have `status: "won"`
- do not grant a Classic bonus roll for home entry; only a resolved six grants
  the Classic bonus

- [ ] **Step 5: Run Classic verification**

Run:

```bash
npm test -- src/lib/ludo/classic.test.ts
npm run lint
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/classic.ts src/lib/ludo/classic.test.ts src/lib/ludo/apply-action.ts
git commit -m "feat: complete Classic movement and victory"
```

### Task 6: Implement Nigerian Two-Die Ordering And Mandatory Usage

**Files:**
- Create: `src/lib/ludo/nigerian.ts`
- Create: `src/lib/ludo/nigerian-dice.test.ts`
- Modify: `src/lib/ludo/legal-actions.ts`
- Modify: `src/lib/ludo/apply-action.ts`

- [ ] **Step 1: Write failing Nigerian roll and order tests**

Create `src/lib/ludo/nigerian-dice.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("Nigerian dice order", () => {
  it("requires two distinct stable die IDs", () => {
    const state = startedMatch("nigerian");
    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [{ id: "only-one", value: 6 }],
      }),
    ).toThrow("Nigerian rolls require exactly two dice");
    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version,
        playerId: "p1",
        dice: [
          { id: "duplicate", value: 6 },
          { id: "duplicate", value: 2 },
        ],
      }),
    ).toThrow("Die IDs must be unique within a roll");
  });

  it("ends the turn when all tokens are in the yard and neither die is six", () => {
    const state = startedMatch("nigerian");
    const result = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "three", value: 3 },
        { id: "five", value: 5 },
      ],
    });
    expect(result.state.players[result.state.activePlayerIndex].id).toBe("p2");
    expect(result.state.pendingRoll).toBeNull();
  });

  it("offers both die orders when both produce a complete legal resolution", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p1-token-2", 20);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "die-2", value: 2 },
        { id: "die-5", value: 5 },
      ],
    }).state;

    expect(getLegalActions(rolled)).toEqual([
      {
        type: "select-die-order",
        expectedVersion: rolled.version,
        playerId: "p1",
        dieIds: ["die-2", "die-5"],
      },
      {
        type: "select-die-order",
        expectedVersion: rolled.version,
        playerId: "p1",
        dieIds: ["die-5", "die-2"],
      },
    ]);
  });

  it("rejects an order that would discard a die when another order uses both", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 51);
    state = withToken(state, "p1-token-2", 55);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "one", value: 1 },
        { id: "six", value: 6 },
      ],
    }).state;

    expect(getLegalActions(rolled)).toEqual([
      {
        type: "select-die-order",
        expectedVersion: rolled.version,
        playerId: "p1",
        dieIds: ["six", "one"],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/nigerian-dice.test.ts
```

Expected: FAIL because Nigerian roll handling does not exist.

- [ ] **Step 3: Implement Nigerian roll analysis**

Create `src/lib/ludo/nigerian.ts` with:

```ts
export function getNigerianLegalActions(state: MatchState): LegalAction[];
export function applyNigerianAction(
  state: MatchState,
  action: LegalAction,
): ApplyActionResult;
export function canResolveAllPossibleDice(
  state: MatchState,
  dieOrder: string[],
): boolean;
```

At roll time:

- require exactly two dice with distinct, non-empty stable IDs
- store dice in submitted order, but do not infer resolution order from array
  position
- compute both die-ID permutations; expose only orders that maximize the
  number of legally consumable dice
- when equal values produce equivalent orders, expose one order sorted by die
  ID
- set `phase: "awaiting-die-order"` when at least one die is usable
- immediately advance when no die is usable
- after `select-die-order`, set `selectedDieOrder` and expose only legal uses
  of the first remaining die, except the mandatory combined-move rule in Task 7

- [ ] **Step 4: Route Nigerian actions through the public APIs**

Update `legal-actions.ts` and `apply-action.ts` to dispatch Nigerian active
states. Reject die orders containing unknown IDs, repeated IDs, or IDs not
equal to the pending roll’s complete die-ID set.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/nigerian-dice.test.ts
npm run typecheck
```

Expected: all dice-order tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/nigerian.ts src/lib/ludo/nigerian-dice.test.ts src/lib/ludo/legal-actions.ts src/lib/ludo/apply-action.ts
git commit -m "feat: add Nigerian dice ordering rules"
```

### Task 7: Implement Nigerian Release, Separate Moves, And Combined Moves

**Files:**
- Modify: `src/lib/ludo/nigerian.ts`
- Modify: `src/lib/ludo/nigerian-dice.test.ts`

- [ ] **Step 1: Add failing release and separate-die tests**

Append to `src/lib/ludo/nigerian-dice.test.ts`:

```ts
describe("Nigerian release and die assignment", () => {
  it("uses six to release and then requires the other die on that token when all were in yard", () => {
    const state = startedMatch("nigerian");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "six", value: 6 },
        { id: "three", value: 3 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["six", "three"],
    }).state;
    const released = applyAction(ordered, {
      type: "release-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "six",
    }).state;

    expect(getLegalActions(released)).toEqual([
      {
        type: "move-token",
        expectedVersion: released.version,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieIds: ["three"],
      },
    ]);
  });

  it("allows double six to release two different tokens and grants one bonus roll", () => {
    const state = startedMatch("nigerian");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "six-a", value: 6 },
        { id: "six-b", value: 6 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["six-a", "six-b"],
    }).state;
    const first = applyAction(ordered, {
      type: "release-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "six-a",
    }).state;
    const result = applyAction(first, {
      type: "release-token",
      expectedVersion: first.version,
      playerId: "p1",
      tokenId: "p1-token-2",
      dieId: "six-b",
    });

    expect(result.state.tokens.filter((token) => token.progress === 0)).toHaveLength(2);
    expect(result.state.phase).toBe("awaiting-roll");
    expect(result.events).toContainEqual({
      type: "bonus-roll-granted",
      playerId: "p1",
      reason: "double-six",
    });
  });

  it("assigns different dice to different playable tokens", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p1-token-2", 20);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "two", value: 2 },
        { id: "four", value: 4 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["two", "four"],
    }).state;
    const first = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["two"],
    }).state;
    const result = applyAction(first, {
      type: "move-token",
      expectedVersion: first.version,
      playerId: "p1",
      tokenId: "p1-token-2",
      dieIds: ["four"],
    });

    expect(result.state.tokens.find((token) => token.id === "p1-token-1")?.progress).toBe(12);
    expect(result.state.tokens.find((token) => token.id === "p1-token-2")?.progress).toBe(24);
  });
});
```

- [ ] **Step 2: Add failing combined-move tests**

Append:

```ts
describe("Nigerian mandatory combined movement", () => {
  it("combines both dice when only one token can be played", () => {
    const state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "two", value: 2 },
        { id: "three", value: 3 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["two", "three"],
    }).state;

    expect(getLegalActions(ordered)).toEqual([
      {
        type: "move-token",
        expectedVersion: ordered.version,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieIds: ["two", "three"],
      },
    ]);
    const result = applyAction(ordered, getLegalActions(ordered)[0]);
    expect(result.state.tokens.find((token) => token.id === "p1-token-1")?.progress).toBe(15);
  });

  it("does not capture on the combined move's intermediate square", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p2-token-1", 1); // green progress 1 -> red ring 14
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "four", value: 4 },
        { id: "three", value: 3 },
      ],
    }).state;
    const ordered = applyAction(rolled, {
      type: "select-die-order",
      expectedVersion: rolled.version,
      playerId: "p1",
      dieIds: ["four", "three"],
    }).state;
    const result = applyAction(ordered, getLegalActions(ordered)[0]);

    expect(result.state.tokens.find((token) => token.id === "p2-token-1"))
      .toMatchObject({ status: "active", progress: 1 });
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: "token-captured" }));
  });
});
```

- [ ] **Step 3: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/nigerian-dice.test.ts
```

Expected: FAIL on release or combined-move assertions.

- [ ] **Step 4: Implement Nigerian die consumption**

In `nigerian.ts`:

- a six can release any yard token or move an active token six
- with more than one playable token, consume one selected die per action and
  allow the second die on the same or a different legal token
- if exactly one token can legally consume the full selected order, expose one
  `move-token` with both `dieIds` and move by the summed value
- for a combined move, inspect only the final destination for capture or home
- when all tokens were in the yard and the roll is six plus another value,
  remember the released token ID and require the other die on that token
- double six may release two tokens; consuming the full roll grants exactly
  one `double-six` bonus
- single six never grants a Nigerian dice-based bonus
- consume each die ID at most once and keep `remainingDieIds` in selected order
- both dice must be used whenever any complete legal resolution uses both

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/nigerian-dice.test.ts
npm run lint
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/nigerian.ts src/lib/ludo/nigerian-dice.test.ts
git commit -m "feat: enforce Nigerian die usage"
```

### Task 8: Implement Nigerian Captures And Opening Protection

**Files:**
- Create: `src/lib/ludo/nigerian-capture-home.test.ts`
- Modify: `src/lib/ludo/nigerian.ts`

- [ ] **Step 1: Write failing general-capture and stack tests**

Create `src/lib/ludo/nigerian-capture-home.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyAction, getLegalActions } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

function rollAndOrder(
  state: ReturnType<typeof startedMatch>,
  dice: [{ id: string; value: 1 | 2 | 3 | 4 | 5 | 6 }, { id: string; value: 1 | 2 | 3 | 4 | 5 | 6 }],
) {
  const rolled = applyAction(state, {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId: "p1",
    dice,
  }).state;
  return applyAction(rolled, {
    type: "select-die-order",
    expectedVersion: rolled.version,
    playerId: "p1",
    dieIds: dice.map((die) => die.id),
  }).state;
}

describe("Nigerian captures", () => {
  it("captures one token from an opposing stack and immediately wins the capturer", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 5);
    state = withToken(state, "p1-token-2", 30);
    state = withToken(state, "p2-token-1", 46); // green 46 -> ring 7
    state = withToken(state, "p2-token-2", 46);
    const ordered = rollAndOrder(state, [
      { id: "two", value: 2 },
      { id: "one", value: 1 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["two"],
    });

    expect(result.state.tokens.find((token) => token.id === "p1-token-1"))
      .toMatchObject({ status: "won", progress: 57 });
    expect(result.state.tokens.filter((token) =>
      ["p2-token-1", "p2-token-2"].includes(token.id) &&
      token.status === "yard"
    )).toHaveLength(1);
    expect(result.events).toContainEqual({
      type: "token-won",
      playerId: "p1",
      tokenId: "p1-token-1",
      reason: "capture",
    });
    expect(getLegalActions(result.state)).not.toContainEqual(
      expect.objectContaining({ tokenId: "p1-token-1" }),
    );
  });

  it("requires a remaining die on another token after the capturer becomes won", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 5);
    state = withToken(state, "p1-token-2", 20);
    state = withToken(state, "p2-token-1", 46);
    const ordered = rollAndOrder(state, [
      { id: "two", value: 2 },
      { id: "three", value: 3 },
    ]);
    const captured = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["two"],
    }).state;

    expect(getLegalActions(captured)).toEqual([
      {
        type: "move-token",
        expectedVersion: captured.version,
        playerId: "p1",
        tokenId: "p1-token-2",
        dieIds: ["three"],
      },
    ]);
  });
});
```

- [ ] **Step 2: Add failing opening-protection examples**

Append:

```ts
describe("Nigerian opening protection", () => {
  it("has no general safe spaces", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 7);
    state = withToken(state, "p1-token-2", 30);
    state = withToken(state, "p2-token-1", 47); // green 47 -> Classic-safe ring 8
    const ordered = rollAndOrder(state, [
      { id: "one", value: 1 },
      { id: "two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["one"],
    });

    expect(result.state.tokens.find((token) => token.id === "p2-token-1"))
      .toMatchObject({ status: "yard", progress: null });
  });

  it("lets an opponent stop on another color's occupied opening without capture", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 12);
    state = withToken(state, "p1-token-2", 30);
    state = withToken(state, "p2-token-1", 0); // green opening ring 13
    const ordered = rollAndOrder(state, [
      { id: "one", value: 1 },
      { id: "two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["one"],
    });

    expect(result.state.tokens.find((token) => token.id === "p1-token-1")?.progress).toBe(13);
    expect(result.state.tokens.find((token) => token.id === "p2-token-1"))
      .toMatchObject({ status: "active", progress: 0 });
  });

  it("release-captures an opponent on the releasing color's opening and wins", () => {
    let state = startedMatch("nigerian");
    state = withToken(state, "p2-token-1", 39); // green progress 39 -> red opening 0
    const ordered = rollAndOrder(state, [
      { id: "six", value: 6 },
      { id: "two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "release-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieId: "six",
    });

    expect(result.state.tokens.find((token) => token.id === "p1-token-1"))
      .toMatchObject({ status: "won", progress: 57 });
    expect(result.state.tokens.find((token) => token.id === "p2-token-1"))
      .toMatchObject({ status: "yard", progress: null });
  });
});
```

- [ ] **Step 3: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/nigerian-capture-home.test.ts
```

Expected: FAIL on Nigerian capture behavior.

- [ ] **Step 4: Implement Nigerian collision rules**

In `nigerian.ts`:

- same-color tokens may share any ring square and never block movement
- ordinary landing on one or more opposing tokens captures exactly one,
  choosing the lexicographically smallest token ID for deterministic replay
- ordinary capture is suppressed only when the destination is the opening
  square belonging to the opposing token’s color and that token has
  `progress: 0`
- an opponent may coexist on that protected opening; the moving opponent does
  not become won
- releasing onto the current player’s opening ignores protection for an
  opponent there, captures one deterministic opponent, and immediately marks
  the released token `{ status: "won", progress: 57 }`
- every successful Nigerian capture immediately marks the capturer won
- a won capturer cannot consume a remaining die
- if another token can use the remaining die, preserve it and require that move
- emit events in this order: release/move, capture, token-won, then any turn,
  bonus, or match event

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/nigerian-capture-home.test.ts
npm run typecheck
```

Expected: all capture and opening tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/nigerian.ts src/lib/ludo/nigerian-capture-home.test.ts
git commit -m "feat: add Nigerian capture rules"
```

### Task 9: Complete Nigerian Home, Bonus-Roll, Discard, And Victory Rules

**Files:**
- Modify: `src/lib/ludo/nigerian.ts`
- Modify: `src/lib/ludo/nigerian-capture-home.test.ts`

- [ ] **Step 1: Add failing home and remaining-die tests**

Append to `src/lib/ludo/nigerian-capture-home.test.ts`:

```ts
describe("Nigerian home and remaining dice", () => {
  it("requires exact progress 57 and grants one home bonus roll", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 56);
    state = withToken(state, "p1-token-2", 20);
    const ordered = rollAndOrder(state, [
      { id: "one", value: 1 },
      { id: "three", value: 3 },
    ]);
    const home = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["one"],
    });

    expect(home.state.tokens.find((token) => token.id === "p1-token-1"))
      .toMatchObject({ status: "won", progress: 57 });
    expect(getLegalActions(home.state)).toContainEqual({
      type: "move-token",
      expectedVersion: home.state.version,
      playerId: "p1",
      tokenId: "p1-token-2",
      dieIds: ["three"],
    });
  });

  it("discards the remaining die when a token reaches home and no other token can use it", () => {
    const state = withToken(startedMatch("nigerian"), "p1-token-1", 56);
    const ordered = rollAndOrder(state, [
      { id: "one", value: 1 },
      { id: "three", value: 3 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["one"],
    });

    expect(result.state.phase).toBe("awaiting-roll");
    expect(result.state.pendingRoll).toBeNull();
    expect(result.events).toContainEqual({
      type: "bonus-roll-granted",
      playerId: "p1",
      reason: "home",
    });
  });

  it("does not expose a move that overshoots exact 57", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 56);
    state = withToken(state, "p1-token-2", 20);
    const ordered = rollAndOrder(state, [
      { id: "two", value: 2 },
      { id: "three", value: 3 },
    ]);
    expect(getLegalActions(ordered)).not.toContainEqual(
      expect.objectContaining({ tokenId: "p1-token-1" }),
    );
  });
});
```

- [ ] **Step 2: Add failing non-stacking bonus and victory tests**

Append:

```ts
describe("Nigerian bonus rolls and victory", () => {
  it("grants only one bonus when double six also brings a token home", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 51);
    state = withToken(state, "p1-token-2", 20);
    const ordered = rollAndOrder(state, [
      { id: "six-a", value: 6 },
      { id: "six-b", value: 6 },
    ]);
    const first = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["six-a"],
    }).state;
    const result = applyAction(first, {
      type: "move-token",
      expectedVersion: first.version,
      playerId: "p1",
      tokenId: "p1-token-2",
      dieIds: ["six-b"],
    });

    expect(result.events.filter((event) => event.type === "bonus-roll-granted"))
      .toHaveLength(1);
    expect(result.state.phase).toBe("awaiting-roll");
  });

  it("allows a bonus roll to earn another bonus roll", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 56);
    state = withToken(state, "p1-token-2", 56);
    state = withToken(state, "p1-token-3", 57);
    state = withToken(state, "p1-token-4", 57);
    let ordered = rollAndOrder(state, [
      { id: "home-one", value: 1 },
      { id: "blocked-six", value: 6 },
    ]);
    state = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["home-one"],
    }).state;
    expect(state.phase).toBe("awaiting-roll");

    const next = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "bonus-six-a", value: 6 },
        { id: "bonus-six-b", value: 6 },
      ],
    });
    expect(next.state.players[next.state.activePlayerIndex].id).toBe("p1");
  });

  it("wins immediately when the fourth token becomes won", () => {
    let state = startedMatch("nigerian");
    for (const tokenId of ["p1-token-1", "p1-token-2", "p1-token-3"]) {
      state = withToken(state, tokenId, 57);
    }
    state = withToken(state, "p1-token-4", 56);
    const ordered = rollAndOrder(state, [
      { id: "winning-one", value: 1 },
      { id: "discarded-two", value: 2 },
    ]);
    const result = applyAction(ordered, {
      type: "move-token",
      expectedVersion: ordered.version,
      playerId: "p1",
      tokenId: "p1-token-4",
      dieIds: ["winning-one"],
    });

    expect(result.state).toMatchObject({
      status: "completed",
      winnerPlayerId: "p1",
      pendingRoll: null,
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/nigerian-capture-home.test.ts
```

Expected: FAIL on home, bonus, or completion behavior.

- [ ] **Step 4: Implement the remaining Nigerian rules**

In `nigerian.ts`:

- reject any individual or combined destination above `57`
- progress `52..56` is private and has no collisions
- exact `57` emits `token-entered-home` and `token-won(reason: "home")`
- remember whether the current roll earned a home bonus or double-six bonus,
  but emit at most one `bonus-roll-granted` when the roll finishes
- prefer `reason: "double-six"` when both double six and home qualify
- after home entry, discard remaining dice only when no non-won token can
  legally consume them; otherwise require their use
- after a capture, apply the same remaining-die rule but never allow the won
  capturer to consume another die
- a bonus roll returns the same active player to `awaiting-roll`; that new roll
  independently evaluates bonus conditions
- immediately complete the match when all four player tokens are won

- [ ] **Step 5: Run all gameplay tests**

Run:

```bash
npm test -- src/lib/ludo/classic.test.ts src/lib/ludo/nigerian-dice.test.ts src/lib/ludo/nigerian-capture-home.test.ts
npm run lint
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/nigerian.ts src/lib/ludo/nigerian-capture-home.test.ts
git commit -m "feat: complete Nigerian home and bonus rules"
```

### Task 10: Add Connection And Forfeit Lifecycle Actions

**Files:**
- Create: `src/lib/ludo/lifecycle.test.ts`
- Modify: `src/lib/ludo/legal-actions.ts`
- Modify: `src/lib/ludo/apply-action.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `src/lib/ludo/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyAction } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("match lifecycle actions", () => {
  it("rejects stale versions without mutating state", () => {
    const state = startedMatch("classic");
    const snapshot = structuredClone(state);
    expect(() =>
      applyAction(state, {
        type: "roll-dice",
        expectedVersion: state.version - 1,
        playerId: "p1",
        dice: [{ id: "one", value: 1 }],
      }),
    ).toThrow("Expected version");
    expect(state).toEqual(snapshot);
  });

  it("records disconnect and reconnect events without changing the turn", () => {
    const state = startedMatch("classic");
    const disconnected = applyAction(state, {
      type: "set-connection",
      expectedVersion: state.version,
      playerId: "p2",
      connected: false,
    });
    const reconnected = applyAction(disconnected.state, {
      type: "set-connection",
      expectedVersion: disconnected.state.version,
      playerId: "p2",
      connected: true,
    });
    expect(reconnected.state.activePlayerIndex).toBe(0);
    expect(reconnected.events).toEqual([
      { type: "connection-changed", playerId: "p2", connected: true },
    ]);
  });

  it("removes a forfeited player's active tokens and continues with remaining players", () => {
    const state = startedMatch("classic");
    const result = applyAction(state, {
      type: "forfeit-player",
      expectedVersion: state.version,
      playerId: "p1",
    });
    expect(result.state.players[0].forfeited).toBe(true);
    expect(result.state.tokens.filter((token) => token.playerId === "p1"))
      .toEqual([]);
    expect(result.state.players[result.state.activePlayerIndex].id).toBe("p2");
  });

  it("resets consecutive timeouts after a completed non-timeout turn", () => {
    const base = withToken(startedMatch("classic"), "p1-token-1", 10);
    const state = {
      ...base,
      players: base.players.map((player) =>
        player.id === "p1"
          ? { ...player, consecutiveTimeouts: 2 }
          : player,
      ),
    };
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "normal-turn", value: 2 }],
    }).state;
    const result = applyAction(rolled, {
      type: "move-token",
      expectedVersion: rolled.version,
      playerId: "p1",
      tokenId: "p1-token-1",
      dieIds: ["normal-turn"],
    });

    expect(result.state.players.find((player) => player.id === "p1"))
      .toMatchObject({ consecutiveTimeouts: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/lifecycle.test.ts
```

Expected: FAIL because connection and forfeit lifecycle actions are absent.

- [ ] **Step 3: Implement connection and forfeit actions**

In `apply-action.ts`:

- permit `set-connection` for an existing player in lobby, active, or completed
  states; emit one event and change no gameplay field
- permit `forfeit-player` only in an active match
- mark the player forfeited, remove all of that player’s tokens, clear their
  pending roll if they were active, and advance to the next non-forfeited player
- when only one non-forfeited player remains, complete the match immediately
  with that player as winner
- reset a player’s `consecutiveTimeouts` to zero after any completed
  non-timeout turn

- [ ] **Step 4: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/lifecycle.test.ts
npm run typecheck
```

Expected: all lifecycle tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ludo/lifecycle.test.ts src/lib/ludo/legal-actions.ts src/lib/ludo/apply-action.ts
git commit -m "feat: add match lifecycle actions"
```

### Task 11: Enumerate Complete Legal Turn Sequences And Resolve Timeouts

**Files:**
- Create: `src/lib/ludo/turn-sequences.ts`
- Create: `src/lib/ludo/turn-sequences.test.ts`
- Modify: `src/lib/ludo/lifecycle.test.ts`
- Modify: `src/lib/ludo/apply-action.ts`
- Modify: `src/lib/ludo/index.ts`

- [ ] **Step 1: Write failing enumeration tests**

Create `src/lib/ludo/turn-sequences.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  applyAction,
  enumerateLegalTurnSequences,
} from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("enumerateLegalTurnSequences", () => {
  it("enumerates every Classic release choice in stable token order", () => {
    const state = startedMatch("classic");
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [{ id: "six", value: 6 }],
    }).state;
    const sequences = enumerateLegalTurnSequences(rolled);

    expect(sequences.map((sequence) => sequence.actions[0])).toEqual(
      ["p1-token-1", "p1-token-2", "p1-token-3", "p1-token-4"].map(
        (tokenId) => ({
          type: "release-token",
          expectedVersion: rolled.version,
          playerId: "p1",
          tokenId,
          dieId: "six",
        }),
      ),
    );
  });

  it("enumerates Nigerian die orders and token assignments to terminal roll states", () => {
    let state = withToken(startedMatch("nigerian"), "p1-token-1", 10);
    state = withToken(state, "p1-token-2", 20);
    const rolled = applyAction(state, {
      type: "roll-dice",
      expectedVersion: state.version,
      playerId: "p1",
      dice: [
        { id: "two", value: 2 },
        { id: "three", value: 3 },
      ],
    }).state;
    const sequences = enumerateLegalTurnSequences(rolled);

    expect(sequences).toHaveLength(8);
    expect(sequences.every((sequence) =>
      sequence.state.pendingRoll === null &&
      sequence.state.phase === "awaiting-roll"
    )).toBe(true);
  });

  it("does not mutate the starting state", () => {
    const state = startedMatch("classic");
    const snapshot = structuredClone(state);
    enumerateLegalTurnSequences(state);
    expect(state).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/turn-sequences.test.ts
```

Expected: FAIL because `enumerateLegalTurnSequences` is not exported.

- [ ] **Step 3: Implement exhaustive deterministic enumeration**

Create `src/lib/ludo/turn-sequences.ts`:

```ts
import { applyAction } from "./apply-action";
import { getLegalActions } from "./legal-actions";
import type { DomainEvent, MatchState, TurnSequence } from "./types";

export function enumerateLegalTurnSequences(state: MatchState): TurnSequence[] {
  const sequences: TurnSequence[] = [];

  function visit(
    current: MatchState,
    actions: TurnSequence["actions"],
    events: DomainEvent[],
  ): void {
    const legal = getLegalActions(current).filter(
      (action) =>
        action.type !== "roll-dice" &&
        action.type !== "resolve-timeout" &&
        action.type !== "set-connection" &&
        action.type !== "forfeit-player",
    );
    const rollResolved =
      current.pendingRoll === null ||
      current.status === "completed";

    if (actions.length > 0 && rollResolved) {
      sequences.push({ actions, state: current, events });
      return;
    }

    for (const action of legal) {
      const result = applyAction(current, action);
      visit(result.state, [...actions, action], [...events, ...result.events]);
    }
  }

  visit(structuredClone(state), [], []);
  const unique = new Map(
    sequences.map((sequence) => [
      JSON.stringify(sequence.actions),
      sequence,
    ]),
  );
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, sequence]) => sequence);
}
```

This terminal condition ends after the current pending roll is consumed,
discarded, or completes the match. It never includes a future `roll-dice`
action, even when the terminal state grants a bonus roll.

- [ ] **Step 4: Implement timeout application**

In `apply-action.ts`, for `resolve-timeout`:

- call `enumerateLegalTurnSequences(state)`
- find an entry whose `actions` exactly equal `action.sequence`
- reject absent or partial sequences
- adopt the enumerated terminal state, but increment from the timeout action’s
  starting version by one rather than leaking internal simulated versions
- append `turn-timed-out` after the sequence’s gameplay events
- increment the timed-out player’s consecutive count
- forfeit that player immediately at count `3`, reusing the same token-removal
  and winner logic as explicit forfeit

Append these complete timeout tests to `src/lib/ludo/lifecycle.test.ts` and add
`enumerateLegalTurnSequences` to its imports:

```ts
it("accepts only a complete enumerated timeout sequence", () => {
  const state = withToken(startedMatch("classic"), "p1-token-1", 10);
  const rolled = applyAction(state, {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId: "p1",
    dice: [{ id: "timeout-three", value: 3 }],
  }).state;
  const sequence = enumerateLegalTurnSequences(rolled)[0].actions;
  const result = applyAction(rolled, {
    type: "resolve-timeout",
    expectedVersion: rolled.version,
    playerId: "p1",
    sequence,
  });

  expect(result.events).toContainEqual({
    type: "turn-timed-out",
    playerId: "p1",
    consecutiveTimeouts: 1,
  });
  expect(result.state.players[0].consecutiveTimeouts).toBe(1);
});

it("rejects a partial timeout sequence", () => {
  const state = startedMatch("classic");
  const rolled = applyAction(state, {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId: "p1",
    dice: [{ id: "timeout-six", value: 6 }],
  }).state;

  expect(() =>
    applyAction(rolled, {
      type: "resolve-timeout",
      expectedVersion: rolled.version,
      playerId: "p1",
      sequence: [],
    }),
  ).toThrow("Timeout sequence is not a complete legal turn");
});

it("forfeits on the third consecutive timeout", () => {
  const base = withToken(startedMatch("classic"), "p1-token-1", 10);
  const state = {
    ...base,
    players: base.players.map((player) =>
      player.id === "p1"
        ? { ...player, consecutiveTimeouts: 2 }
        : player,
    ),
  };
  const rolled = applyAction(state, {
    type: "roll-dice",
    expectedVersion: state.version,
    playerId: "p1",
    dice: [{ id: "third-timeout", value: 2 }],
  }).state;
  const sequence = enumerateLegalTurnSequences(rolled)[0].actions;
  const result = applyAction(rolled, {
    type: "resolve-timeout",
    expectedVersion: rolled.version,
    playerId: "p1",
    sequence,
  });

  expect(result.state.players.find((player) => player.id === "p1")?.forfeited)
    .toBe(true);
  expect(result.state.tokens.some((token) => token.playerId === "p1")).toBe(false);
});
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/turn-sequences.test.ts src/lib/ludo/lifecycle.test.ts
npm run lint
npm run typecheck
```

Expected: all commands pass with no skipped tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ludo/turn-sequences.ts src/lib/ludo/turn-sequences.test.ts src/lib/ludo/lifecycle.test.ts src/lib/ludo/apply-action.ts src/lib/ludo/index.ts
git commit -m "feat: enumerate complete legal turns"
```

### Task 12: Add Deterministic Replay With Event Verification

**Files:**
- Create: `src/lib/ludo/replay.ts`
- Create: `src/lib/ludo/replay.test.ts`
- Modify: `src/lib/ludo/index.ts`

- [ ] **Step 1: Write failing replay tests**

Create `src/lib/ludo/replay.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { applyAction, replayMatch } from "@/lib/ludo";
import { startedMatch } from "@/lib/ludo/test/builders";
import type { MatchAction, ReplayEntry } from "@/lib/ludo";

describe("replayMatch", () => {
  it("reproduces identical state and events from stable-ID actions", () => {
    const initial = startedMatch("classic");
    const actions: MatchAction[] = [
      {
        type: "roll-dice",
        expectedVersion: initial.version,
        playerId: "p1",
        dice: [{ id: "turn-1-roll-1-die-1", value: 6 }],
      },
      {
        type: "release-token",
        expectedVersion: initial.version + 1,
        playerId: "p1",
        tokenId: "p1-token-1",
        dieId: "turn-1-roll-1-die-1",
      },
    ];
    let state = initial;
    const entries: ReplayEntry[] = actions.map((action) => {
      const result = applyAction(state, action);
      state = result.state;
      return {
        action,
        events: result.events,
        stateVersion: result.state.version,
      };
    });

    expect(replayMatch(initial, entries)).toEqual(state);
  });

  it("rejects altered events and version gaps", () => {
    const initial = startedMatch("classic");
    expect(() =>
      replayMatch(initial, [{
        action: {
          type: "roll-dice",
          expectedVersion: initial.version,
          playerId: "p1",
          dice: [{ id: "five", value: 5 }],
        },
        events: [],
        stateVersion: initial.version + 2,
      }]),
    ).toThrow("Replay entry 0 does not match deterministic transition");
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/replay.test.ts
```

Expected: FAIL because `replayMatch` is not exported.

- [ ] **Step 3: Implement replay**

Create `src/lib/ludo/replay.ts`:

```ts
import { applyAction } from "./apply-action";
import { LudoRuleError, type MatchState, type ReplayEntry } from "./types";

export function replayMatch(
  initialState: MatchState,
  entries: ReplayEntry[],
): MatchState {
  let state = structuredClone(initialState);

  entries.forEach((entry, index) => {
    const result = applyAction(state, entry.action);
    if (
      result.state.version !== entry.stateVersion ||
      JSON.stringify(result.events) !== JSON.stringify(entry.events)
    ) {
      throw new LudoRuleError(
        "REPLAY_MISMATCH",
        `Replay entry ${index} does not match deterministic transition`,
      );
    }
    state = result.state;
  });

  return state;
}
```

Replay must not regenerate dice, repair actions, ignore event order, or accept
version gaps.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npm test -- src/lib/ludo/replay.test.ts
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ludo/replay.ts src/lib/ludo/replay.test.ts src/lib/ludo/index.ts
git commit -m "feat: add deterministic match replay"
```

### Task 13: Assert Match Invariants And Add fast-check State-Machine Properties

**Files:**
- Create: `src/lib/ludo/invariants.ts`
- Create: `src/lib/ludo/invariants.test.ts`
- Modify: `src/lib/ludo/apply-action.ts`
- Modify: `src/lib/ludo/index.ts`

- [ ] **Step 1: Write failing direct invariant tests**

Create the first section of `src/lib/ludo/invariants.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { assertMatchInvariants } from "@/lib/ludo";
import { startedMatch, withToken } from "@/lib/ludo/test/builders";

describe("assertMatchInvariants", () => {
  it("accepts a valid active match", () => {
    expect(() => assertMatchInvariants(startedMatch("classic"))).not.toThrow();
  });

  it("rejects invalid token progress/status combinations", () => {
    const state = withToken(startedMatch("classic"), "p1-token-1", 10);
    const invalid = {
      ...state,
      tokens: state.tokens.map((token) =>
        token.id === "p1-token-1"
          ? { ...token, status: "yard" as const, progress: 10 }
          : token,
      ),
    };
    expect(() => assertMatchInvariants(invalid)).toThrow(
      "Yard token p1-token-1 must have null progress",
    );
  });

  it("rejects duplicate pending die IDs", () => {
    const state = {
      ...startedMatch("nigerian"),
      pendingRoll: {
        dice: [
          { id: "same", value: 2 as const },
          { id: "same", value: 6 as const },
        ],
        remainingDieIds: ["same"],
        selectedDieOrder: null,
        forcedTokenId: null,
        startedWithAllTokensInYard: true,
        bonusReason: null,
      },
      phase: "awaiting-die-order" as const,
    };
    expect(() => assertMatchInvariants(state)).toThrow(
      "Pending die IDs must be unique",
    );
  });
});
```

- [ ] **Step 2: Add failing fast-check properties**

Append:

```ts
import fc from "fast-check";

import {
  applyAction,
  enumerateLegalTurnSequences,
  replayMatch,
} from "@/lib/ludo";
import type { MatchState, ReplayEntry } from "@/lib/ludo";

const dieValue = fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<
  1 | 2 | 3 | 4 | 5 | 6
>;

describe("engine properties", () => {
  it("preserves invariants through generated legal Classic turns", () => {
    fc.assert(
      fc.property(
        fc.array(dieValue, { minLength: 1, maxLength: 80 }),
        (values) => {
          let state: MatchState = startedMatch("classic");
          values.forEach((value, index) => {
            if (state.status === "completed") return;
            if (state.phase === "awaiting-roll") {
              const playerId = state.players[state.activePlayerIndex].id;
              state = applyAction(state, {
                type: "roll-dice",
                expectedVersion: state.version,
                playerId,
                dice: [{ id: `classic-${index}`, value }],
              }).state;
            }
            const sequence = enumerateLegalTurnSequences(state)[0];
            if (sequence) state = sequence.state;
            assertMatchInvariants(state);
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it("preserves invariants through generated legal Nigerian turns", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(dieValue, dieValue), { minLength: 1, maxLength: 80 }),
        (rolls) => {
          let state: MatchState = startedMatch("nigerian");
          rolls.forEach(([first, second], index) => {
            if (state.status === "completed") return;
            if (state.phase === "awaiting-roll") {
              const playerId = state.players[state.activePlayerIndex].id;
              state = applyAction(state, {
                type: "roll-dice",
                expectedVersion: state.version,
                playerId,
                dice: [
                  { id: `nigerian-${index}-a`, value: first },
                  { id: `nigerian-${index}-b`, value: second },
                ],
              }).state;
            }
            const sequence = enumerateLegalTurnSequences(state)[0];
            if (sequence) state = sequence.state;
            assertMatchInvariants(state);
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it("replays every generated accepted action exactly", () => {
    fc.assert(
      fc.property(fc.array(dieValue, { minLength: 1, maxLength: 40 }), (values) => {
        const initial = startedMatch("classic");
        let state = initial;
        const entries: ReplayEntry[] = [];
        values.forEach((value, index) => {
          if (state.status === "completed") return;
          const playerId = state.players[state.activePlayerIndex].id;
          const action = {
            type: "roll-dice" as const,
            expectedVersion: state.version,
            playerId,
            dice: [{ id: `replay-${index}`, value }],
          };
          const result = applyAction(state, action);
          entries.push({
            action,
            events: result.events,
            stateVersion: result.state.version,
          });
          state = result.state;
          const sequence = enumerateLegalTurnSequences(state)[0];
          if (sequence) {
            for (const move of sequence.actions) {
              const moveResult = applyAction(state, move);
              entries.push({
                action: move,
                events: moveResult.events,
                stateVersion: moveResult.state.version,
              });
              state = moveResult.state;
            }
          }
        });
        expect(replayMatch(initial, entries)).toEqual(state);
      }),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify failure**

Run:

```bash
npm test -- src/lib/ludo/invariants.test.ts
```

Expected: FAIL because `assertMatchInvariants` is not exported.

- [ ] **Step 4: Implement structural and semantic invariants**

Create `src/lib/ludo/invariants.ts` and throw
`LudoRuleError("INVALID_STATE", message)` for each violation:

- player IDs and colors are unique
- active player index is in bounds and does not point to a forfeited player
  during an active match
- every non-forfeited player owns exactly four unique tokens; forfeited players
  own zero tokens
- token IDs are globally unique and token player/color matches its owner
- yard means `progress: null`
- active means integer progress `0..56`
- won means `progress: 57`
- no token has progress below `0` or above `57`
- lobby has no pending roll and `turnNumber: 0`
- active awaiting-roll has no pending roll
- awaiting-die-order and awaiting-move have a pending roll
- Classic pending rolls contain one die; Nigerian pending rolls contain two
- pending die IDs are non-empty and unique
- `remainingDieIds` and `selectedDieOrder` contain only pending die IDs and no
  duplicates
- completed matches have a valid winner, no pending roll, and exactly four won
  tokens for a gameplay winner unless every opponent forfeited
- active matches have no winner

- [ ] **Step 5: Assert invariants at public boundaries**

Call `assertMatchInvariants(state)` at the start of `getLegalActions` and
`applyAction`, and call it on the returned state before returning. Do not call
it inside private recursive enumeration for partially constructed local
objects; every public transition must still be checked.

- [ ] **Step 6: Run focused and property verification**

Run:

```bash
npm test -- src/lib/ludo/invariants.test.ts
npm run lint
npm run typecheck
```

Expected: all direct tests and all 700 property runs pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ludo/invariants.ts src/lib/ludo/invariants.test.ts src/lib/ludo/apply-action.ts src/lib/ludo/index.ts
git commit -m "test: enforce ludo engine invariants"
```

### Task 14: Lock The Public API And Run The Full Rules-Engine Gate

**Files:**
- Modify: `src/lib/ludo/index.ts`
- Modify: `src/lib/ludo/create-match.test.ts`

- [ ] **Step 1: Add a failing public-surface test**

Append to `src/lib/ludo/create-match.test.ts`:

```ts
import * as engine from "@/lib/ludo";

it("exports the supported rules-engine API", () => {
  expect(Object.keys(engine).sort()).toEqual([
    "CLASSIC_SAFE_RING_INDEXES",
    "LudoRuleError",
    "OPENING_RING_INDEX",
    "applyAction",
    "assertMatchInvariants",
    "createMatch",
    "enumerateLegalTurnSequences",
    "getLegalActions",
    "progressToRingIndex",
    "replayMatch",
  ]);
});
```

- [ ] **Step 2: Run the test and inspect accidental exports**

Run:

```bash
npm test -- src/lib/ludo/create-match.test.ts
```

Expected: FAIL if the barrel leaks ruleset internals or omits a required API.

- [ ] **Step 3: Finalize the barrel**

Make `src/lib/ludo/index.ts` export only:

```ts
export { applyAction } from "./apply-action";
export { progressToRingIndex } from "./board";
export {
  CLASSIC_SAFE_RING_INDEXES,
  OPENING_RING_INDEX,
} from "./constants";
export { createMatch } from "./create-match";
export { assertMatchInvariants } from "./invariants";
export { getLegalActions } from "./legal-actions";
export { replayMatch } from "./replay";
export { enumerateLegalTurnSequences } from "./turn-sequences";
export { LudoRuleError } from "./types";
export type {
  ApplyActionResult,
  CreateMatchInput,
  Die,
  DomainEvent,
  LegalAction,
  MatchAction,
  MatchState,
  ReplayEntry,
  Ruleset,
  TurnSequence,
} from "./types";
```

- [ ] **Step 4: Run the complete engine suite**

Run:

```bash
npm test -- src/lib/ludo
```

Expected: every topology, lifecycle, Classic, Nigerian, enumeration, replay,
and invariant test passes with no skipped tests.

- [ ] **Step 5: Run the repository merge gate**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands pass. This pure engine does not require
`npm run test:e2e` or Supabase database commands because it changes no browser
journey, migration, RLS policy, or trusted database function.

- [ ] **Step 6: Inspect framework independence**

Run:

```bash
rg -n "from ['\"](react|next|@supabase)|window|document|localStorage|Date\\.now|Math\\.random" src/lib/ludo
```

Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ludo/index.ts src/lib/ludo/create-match.test.ts
git commit -m "chore: finalize rules engine API"
```

## Coverage Matrix

| Approved rule | Planned coverage |
|---|---|
| Pure framework-independent TypeScript | Tasks 2, 14 |
| 52-square shared ring | Task 2 |
| Openings red 0, green 13, yellow 26, blue 39 | Task 2 |
| Classic safe indexes 0, 8, 13, 21, 26, 34, 39, 47 | Tasks 2, 5 |
| Progress 0-51 ring, 52-56 private lane, exact 57 won | Tasks 2, 5, 9, 13 |
| Stable die IDs | Tasks 2, 4, 6, 12 |
| Classic one die, six release/move, six bonus | Task 4 |
| Classic captures, safe spaces, exact home, four-token victory | Task 5 |
| Nigerian two dice and chosen order | Task 6 |
| Only double six gives dice bonus | Tasks 7, 9 |
| Separate dice for multiple playable tokens | Task 7 |
| One playable token combines dice uninterrupted | Task 7 |
| Both dice used whenever possible | Tasks 6, 7 |
| All-yard no-six ends turn | Task 6 |
| All-yard six plus value releases then moves released token | Task 7 |
| Capture immediately wins capturer | Task 8 |
| Capturer cannot receive remaining die | Task 8 |
| Exact home wins token and grants bonus | Task 9 |
| Bonus conditions do not stack; bonus may chain | Task 9 |
| Home may discard unusable remaining die | Task 9 |
| Remaining die must move another playable token | Tasks 8, 9 |
| Same-color stacking allowed | Tasks 5, 8 |
| Opposing stack loses one token | Task 8 |
| No Nigerian general safe spaces | Task 8 |
| Own opening protects own token only | Task 8 |
| Opponent may coexist on protected opening | Task 8 |
| Release onto occupied own opening captures and wins | Task 8 |
| First four won tokens completes match | Tasks 5, 9 |
| `createMatch` and `getLegalActions` | Tasks 3, 14 |
| `applyAction` | Tasks 3-10, 14 |
| `enumerateLegalTurnSequences` | Task 11 |
| `replayMatch` | Task 12 |
| `assertMatchInvariants` | Task 13 |
| Property-based tests with fast-check | Tasks 1, 13 |
| TDD and commit after every task | Tasks 1-14 |
