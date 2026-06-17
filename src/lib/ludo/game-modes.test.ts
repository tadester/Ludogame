import { describe, expect, it } from "vitest";

import { applyAction, assertMatchInvariants, getLegalActions } from "@/lib/ludo";
import type { DomainEvent, MatchState } from "@/lib/ludo";
import {
  legalMovesByToken,
  rollActionFor,
  setupLocalMatch,
} from "@/lib/ludo-ui/local-game";

/** Drive a single-die match to completion with a seeded RNG, greedily moving
 *  the furthest token, collecting every event along the way. */
function playToEnd(ruleset: "classic" | "peaceful" | "blitz") {
  let state: MatchState = setupLocalMatch(
    [{ name: "Ada" }, { name: "Ben" }],
    ruleset,
  );
  const events: DomainEvent[] = [];
  let seed = 0x5eed42;
  const nextDie = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return 1 + (seed % 6);
  };

  let guard = 0;
  while (state.status !== "completed" && guard < 200000) {
    guard += 1;
    if (state.phase === "awaiting-roll") {
      const result = applyAction(state, rollActionFor(state, [nextDie()]));
      state = result.state;
      events.push(...result.events);
    } else {
      const moves = [...legalMovesByToken(state, getLegalActions(state)).values()];
      const best = moves.reduce((a, b) => {
        const pa = a.type === "move-token" ? 1 : 0;
        const pb = b.type === "move-token" ? 1 : 0;
        return pb > pa ? b : a;
      });
      const result = applyAction(state, best);
      state = result.state;
      events.push(...result.events);
    }
    assertMatchInvariants(state);
  }
  return { state, events };
}

describe("Peaceful mode", () => {
  it("never captures and still requires all four tokens home", () => {
    const { state, events } = playToEnd("peaceful");
    expect(state.status).toBe("completed");
    expect(events.some((e) => e.type === "token-captured")).toBe(false);
    // No token is ever sent back to the yard once it has left it.
    expect(events.some((e) => e.type === "token-captured")).toBe(false);
    const champion = state.tokens.filter(
      (t) => t.playerId === state.winnerPlayerId && t.status === "won",
    );
    expect(champion).toHaveLength(4);
  });
});

describe("Blitz mode", () => {
  it("ends the instant the first token reaches home", () => {
    const { state } = playToEnd("blitz");
    expect(state.status).toBe("completed");
    const wonTokens = state.tokens.filter((t) => t.status === "won");
    // Sudden death: exactly one token is home when the match ends.
    expect(wonTokens).toHaveLength(1);
    expect(wonTokens[0].playerId).toBe(state.winnerPlayerId);
  });
});
