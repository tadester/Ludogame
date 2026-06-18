import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

import { MatchHud } from "./match-hud";

describe("MatchHud", () => {
  it("shows player colors, dice faces, and configured timer", () => {
    const match = setupLocalMatch(
      [{ name: "Tade" }, { name: "Mikayla" }],
      "extreme",
    );

    render(
      <MatchHud
        activePlayer={match.players[0]}
        currentPlayer={match.players[0]}
        diceCount={1}
        diceFaces={[4]}
        diceSkin="crimson_eye"
        rolling
        canRoll
        onRoll={vi.fn()}
        players={match.players}
        tokens={match.tokens}
        status="Tade to roll."
        timerSeconds={60}
      />,
    );

    expect(screen.getByText("You are red")).toBeVisible();
    expect(screen.getByText("Current turn")).toBeVisible();
    expect(screen.getAllByText("Tade").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Timer: 60s")).toBeVisible();
    expect(screen.getByRole("button", { name: /dice showing 4/i })).toBeVisible();
    expect(screen.getByText("Tade to roll.")).toBeVisible();
  });
});
