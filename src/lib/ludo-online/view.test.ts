import { describe, expect, it } from "vitest";

import { buildStartedMatch, resolveIntent } from "./authority";
import type { OnlineSeat } from "./authority";
import { onlineViewModel } from "./view";

const SEATS: OnlineSeat[] = [
  { userId: "user-a", displayName: "Ada", seat: 1 },
  { userId: "user-b", displayName: "Ben", seat: 2 },
];

describe("onlineViewModel", () => {
  it("lets the active player roll and waits for everyone else", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const mine = onlineViewModel(state, "user-a");
    expect(mine.isMyTurn).toBe(true);
    expect(mine.canRoll).toBe(true);
    expect(mine.activeName).toBe("Ada");

    const theirs = onlineViewModel(state, "user-b");
    expect(theirs.isMyTurn).toBe(false);
    expect(theirs.canRoll).toBe(false);
  });

  it("surfaces movable tokens after a roll", () => {
    let state = buildStartedMatch("m", SEATS, "classic");
    state = resolveIntent(state, "user-a", { kind: "roll" }, () => 6).state;
    const view = onlineViewModel(state, "user-a");
    expect(view.phase).toBe("awaiting-move");
    expect(view.movableTokenIds.length).toBeGreaterThan(0);
    expect(view.canRoll).toBe(false);
  });

  it("reports the winner name when the match completes", () => {
    const state = buildStartedMatch("m", SEATS, "classic");
    const completed = { ...state, status: "completed" as const, winnerPlayerId: "user-b" };
    const view = onlineViewModel(completed, "user-a");
    expect(view.winnerName).toBe("Ben");
    expect(view.isMyTurn).toBe(false);
  });
});
