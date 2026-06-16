import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  applyAction,
  assertMatchInvariants,
  enumerateLegalTurnSequences,
  replayMatch,
} from "@/lib/ludo";
import type { MatchState, ReplayEntry } from "@/lib/ludo";
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
      fc.property(
        fc.array(dieValue, { minLength: 1, maxLength: 40 }),
        (values) => {
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
        },
      ),
      { numRuns: 200 },
    );
  });
});
